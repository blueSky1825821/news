import { jest } from '@jest/globals';
import { closeDb, getDb } from '../src/db.js';

const collectCctvNews = jest.fn();
const originalUrl = 'https://tv.cctv.com/2026/11/23/VIDEfull.shtml';
const news = { status: 'ready', originalUrl, text: '本期节目主要内容：\n1.第一条新闻；\n2.第二条新闻。' };
jest.unstable_mockModule('../src/services/xinwenlianbo/cctv.js', () => ({ collectCctvNews }));

const { getXinwenlianboDate, getXinwenlianboStatus, getXinwenlianboRecord, listXinwenlianboRecords,
  startXinwenlianboTask, deleteXinwenlianboRecord, runXinwenlianboTask } =
  await import('../src/services/xinwenlianbo/orchestrator.js');

describe('Xinwenlianbo CCTV task', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    collectCctvNews.mockReset().mockResolvedValue(news);
    getDb().prepare("INSERT INTO sources (name, rssUrl, category, type) VALUES (?, ?, 'xinwenlianbo', 'xinwenlianbo')")
      .run('CCTV', 'https://example.test/live.m3u8');
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('publishes the complete introduction once and updates the same article on a forced retry', async () => {
    const date = getXinwenlianboDate();
    const first = startXinwenlianboTask(date);
    expect(first.status.status).toBe('collecting');
    expect(() => startXinwenlianboTask(date)).toThrow('已有新闻联播任务');
    const { articleId } = await first.completion;
    expect(getXinwenlianboStatus()).toMatchObject({ status: 'completed', articleId });
    expect(await runXinwenlianboTask(date)).toEqual({ skipped: true });
    expect(collectCctvNews).toHaveBeenCalledTimes(1);
    const article = getDb().prepare('SELECT content, originalUrl FROM articles WHERE id = ?').get(articleId);
    expect(article.originalUrl).toBe(originalUrl);
    expect(article.content).toBe('<p>本期节目主要内容：</p><p>1.第一条新闻；</p><p>2.第二条新闻。</p>');

    collectCctvNews.mockResolvedValueOnce({ ...news, text: '更新的简介。' });
    await expect(startXinwenlianboTask(date, { force: true }).completion).resolves.toMatchObject({ articleId });
    expect(getDb().prepare('SELECT transcript FROM articles WHERE id = ?').get(articleId).transcript)
      .toContain('更新的简介。');
  });

  it('retries when CCTV has not published the full episode', async () => {
    const date = getXinwenlianboDate();
    collectCctvNews.mockResolvedValueOnce({ status: 'pending', message: '尚未发布' });
    await expect(runXinwenlianboTask(date)).resolves.toEqual({ status: 'pending' });
    expect(getXinwenlianboStatus().status).toBe('pending');
    expect(getDb().prepare('SELECT id FROM articles').all()).toEqual([]);
    await expect(runXinwenlianboTask(date)).resolves.toMatchObject({ status: 'completed' });
  });

  it('keeps the previous article available when a forced refresh fails', async () => {
    const date = getXinwenlianboDate();
    const { articleId } = await startXinwenlianboTask(date).completion;
    collectCctvNews.mockRejectedValueOnce(new Error('央视网请求失败'));

    await expect(startXinwenlianboTask(date, { force: true }).completion).rejects.toThrow('央视网请求失败');
    expect(getXinwenlianboStatus()).toMatchObject({ status: 'failed', articleId });
    expect(getDb().prepare('SELECT summary FROM articles WHERE id = ?').get(articleId).summary).toBe(news.text);
  });

  it.each([false, true])('deletes a completed task with deleteArticle=%s', async deleteArticle => {
    const task = startXinwenlianboTask(getXinwenlianboDate());
    const [{ id }] = listXinwenlianboRecords(1, 10).items;
    expect(() => deleteXinwenlianboRecord(id)).toThrow('正在处理');
    const { articleId } = await task.completion;

    expect(deleteXinwenlianboRecord(id, { deleteArticle })).toEqual({ articleDeleted: deleteArticle });
    expect(getXinwenlianboRecord(id)).toBeNull();
    expect(Boolean(getDb().prepare('SELECT id FROM articles WHERE id = ?').get(articleId))).toBe(!deleteArticle);
  });
});
