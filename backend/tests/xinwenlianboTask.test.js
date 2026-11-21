import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { jest } from '@jest/globals';
import { closeDb, getDb } from '../src/db.js';
import { setSetting } from '../src/models/settings.js';

const record = jest.fn(async (_url, _duration, output) => writeFileSync(output, Buffer.alloc(64_000)));
const transcribe = jest.fn(async () => '测试转录');
const summarize = jest.fn();
jest.unstable_mockModule('../src/services/xinwenlianbo/recorder.js', () => ({
  startRecording: record,
  stopRecording: () => true
}));
jest.unstable_mockModule('../src/services/xinwenlianbo/transcriber.js', () => ({ transcribe }));

jest.unstable_mockModule('../src/services/xinwenlianbo/summarizer.js', () => ({ summarize }));

const { getXinwenlianboDate, getXinwenlianboStatus, getXinwenlianboRecord, listXinwenlianboRecords,
  startXinwenlianboSummary, startXinwenlianboTask, deleteXinwenlianboRecord, cleanupExpiredXinwenlianboAudio,
  getXinwenlianboAudio, deleteXinwenlianboAudio, runXinwenlianboTask, stopXinwenlianboTask } =
  await import('../src/services/xinwenlianbo/orchestrator.js');

describe('Xinwenlianbo recording task', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    record.mockClear();
    transcribe.mockClear();
    summarize.mockReset();
    setSetting('xwlb_whisperExecutable', process.execPath);
    setSetting('xwlb_whisperModelPath', new URL(import.meta.url).pathname);
    getDb().prepare("INSERT INTO sources (name, rssUrl, category, type) VALUES (?, ?, 'xinwenlianbo', 'xinwenlianbo')")
      .run('CCTV', 'https://example.test/live.m3u8');
  });

  afterEach(() => {
    for (const [, , output] of record.mock.calls) rmSync(dirname(output), { recursive: true, force: true });
    closeDb();
    delete process.env.DB_PATH;
  });

  test.each(['另一段无法对齐的文字', '  '])('falls back to the original recording for unusable segment %j', async segment => {
    record.mockImplementationOnce(async (_url, _duration, output) => {
      const wav = Buffer.alloc(44 + 62 * 32_000);
      wav.write('RIFF');
      wav.write('WAVEfmt ', 8);
      wav.writeUInt32LE(16, 16);
      wav.write('data', 36);
      writeFileSync(output, wav);
    });
    transcribe.mockResolvedValueOnce('第一部分正在播报新闻')
      .mockImplementationOnce(async () => {
        expect(getXinwenlianboStatus()).toMatchObject({
          transcribedSeconds: 60,
          transcriptPreview: '第一部分正在播报新闻'
        });
        return segment;
      })
      .mockResolvedValueOnce('整段识别结果');
    const date = getXinwenlianboDate();

    await expect(startXinwenlianboTask(date).completion).resolves.toMatchObject({ status: 'completed' });
    expect(transcribe).toHaveBeenCalledTimes(3);
    expect(transcribe.mock.calls[2][0]).toBe(record.mock.calls[0][2]);
    expect(listXinwenlianboRecords(1, 10).items.map(({ id }) => getXinwenlianboRecord(id).transcript))
      .toEqual(['整段识别结果']);
  });

  it('claims the pipeline once, completes it, and updates the same article on a forced retry', async () => {
    const date = getXinwenlianboDate();
    const first = startXinwenlianboTask(date, { durationMinutes: 2 });
    expect(first.status).toMatchObject({ status: 'recording', durationMinutes: 2 });
    expect(() => startXinwenlianboTask(date)).toThrow('已有新闻联播任务');
    expect(record).toHaveBeenCalledWith(expect.any(String), 120, expect.any(String));
    const { articleId } = await first.completion;
    expect(getXinwenlianboStatus()).toMatchObject({ status: 'completed', articleId });
    expect(() => startXinwenlianboTask(date)).toThrow('已完成');

    transcribe.mockResolvedValueOnce('更新的转录');
    const next = startXinwenlianboTask(date, { force: true, durationMinutes: 1 });
    await expect(next.completion).resolves.toMatchObject({ articleId, status: 'completed' });
    expect(getDb().prepare('SELECT id, transcript FROM articles').all())
      .toEqual([{ id: articleId, transcript: '更新的转录' }]);
  });

  it('preserves legacy and new audio on redo and removes only the selected clip', async () => {
    const date = getXinwenlianboDate();
    const directory = mkdtempSync(join(tmpdir(), 'xinwenlianbo-'));
    const legacy = join(directory, 'recording.wav');
    try {
      writeFileSync(legacy, 'legacy recording');
      const { lastInsertRowid: id } = getDb().prepare(`
        INSERT INTO xinwenlianbo_tasks (taskDate, status, audioFilePath, startedAt)
        VALUES (?, 'completed', ?, datetime('now'))
      `).run(date, legacy);
      expect(getXinwenlianboAudio(id, 'legacy')).toBe(legacy);

      const retry = startXinwenlianboTask(date, { force: true, durationMinutes: 1 });
      const [old] = listXinwenlianboRecords(1, 10).items[0].audio;
      expect(getXinwenlianboAudio(id, old.id)).toBe(legacy);
      const { articleId } = await retry.completion;
      const [latest, previous] = listXinwenlianboRecords(1, 10).items[0].audio;
      expect(previous).toEqual(old);
      expect(getXinwenlianboAudio(id, latest.id)).toBe(record.mock.calls[0][2]);

      deleteXinwenlianboAudio(id, old.id);
      expect(existsSync(legacy)).toBe(false);
      expect(() => getXinwenlianboAudio(id, old.id)).toThrow('录音文件不存在');
      expect(listXinwenlianboRecords(1, 10).items[0].audio).toEqual([latest]);
      expect(getXinwenlianboRecord(id)).toMatchObject({ transcript: '测试转录', articleId });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('allows retrying a task left running by a restart', async () => {
    const date = getXinwenlianboDate();
    getDb().prepare("INSERT INTO xinwenlianbo_tasks (taskDate, status) VALUES (?, 'recording')").run(date);
    expect(getXinwenlianboStatus()).toMatchObject({ status: 'failed' });
    await expect(startXinwenlianboTask(date, { durationMinutes: 1 }).completion)
      .resolves.toMatchObject({ status: 'completed' });
  });

  it('keeps an incomplete scheduled recording without publishing a summary', async () => {
    await expect(runXinwenlianboTask(getXinwenlianboDate())).rejects.toThrow('定时录制提前结束');
    expect(transcribe).not.toHaveBeenCalled();
    const [task] = listXinwenlianboRecords(1, 10).items;
    expect(task.status).toBe('failed');
    expect(getXinwenlianboAudio(task.id, task.audio[0].id)).toBe(record.mock.calls[0][2]);
    expect(getDb().prepare('SELECT id FROM articles').all()).toEqual([]);
  });

  it('allows an administrator to finish a scheduled recording early', async () => {
    const completion = runXinwenlianboTask(getXinwenlianboDate());
    expect(stopXinwenlianboTask({ finish: true })).toMatchObject({ status: 'finishing' });
    await expect(completion).resolves.toMatchObject({ status: 'completed' });
  });
  it('lists and summarizes a historical transcript without recording again', async () => {
    const date = '2025-06-02';
    const { lastInsertRowid: id } = getDb().prepare(`
      INSERT INTO xinwenlianbo_tasks (taskDate, status, transcript) VALUES (?, 'failed', '旧任务的完整转录')
    `).run(date);
    const page = listXinwenlianboRecords(1, 10);
    expect(page).toMatchObject({ items: [{ id, taskDate: date, hasTranscript: 1 }], pagination: { total: 1 } });
    expect(page.items[0]).not.toHaveProperty('transcript');
    expect(getXinwenlianboRecord(id).transcript).toBe('旧任务的完整转录');

    setSetting('xwlb_llmApiUrl', 'https://example.test/summary');
    setSetting('xwlb_llmApiKey', 'test');
    summarize.mockResolvedValueOnce({ headlines: ['要闻'], summary: '重新生成的历史新闻' });
    const task = startXinwenlianboSummary(id);
    expect(task.status).toMatchObject({ date, status: 'summarizing' });
    expect(() => startXinwenlianboSummary(id)).toThrow('已有新闻联播任务');
    const { articleId } = await task.completion;
    expect(getXinwenlianboRecord(id)).toMatchObject({ status: 'completed', articleId, summary: '重新生成的历史新闻' });
    expect(record).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();

    summarize.mockRejectedValueOnce(new Error('Upstream failure'));
    await expect(startXinwenlianboSummary(id).completion).rejects.toThrow('摘要生成失败');
    expect(getXinwenlianboRecord(id)).toMatchObject({ articleId, status: 'completed', summary: '重新生成的历史新闻' });
  });

  it('rejects summaries for a missing record or missing transcript', () => {
    expect(() => startXinwenlianboSummary(91)).toThrow('录制记录不存在');
    const { lastInsertRowid: id } = getDb().prepare(
      "INSERT INTO xinwenlianbo_tasks (taskDate, status) VALUES ('2025-06-02', 'cancelled')"
    ).run();
    expect(() => startXinwenlianboSummary(id)).toThrow('没有可用于总结的转录文本');
  });
  it('removes recording data and retained audio but keeps the published news by default', async () => {
    const date = getXinwenlianboDate();
    const task = startXinwenlianboTask(date, { durationMinutes: 1 });
    const { id } = listXinwenlianboRecords(1, 10).items[0];
    expect(() => deleteXinwenlianboRecord(id)).toThrow('正在处理');
    const { articleId } = await task.completion;

    const directory = mkdtempSync(join(tmpdir(), 'xinwenlianbo-'));
    const audio = join(directory, 'recording.wav');
    try {
      writeFileSync(audio, 'test recording');
      getDb().prepare('UPDATE xinwenlianbo_tasks SET audioFilePath = ? WHERE id = ?').run(audio, id);
      expect(deleteXinwenlianboRecord(id)).toEqual({ articleDeleted: false });
      expect(getXinwenlianboRecord(id)).toBeNull();
      expect(existsSync(audio)).toBe(false);
      expect(getDb().prepare('SELECT id FROM articles WHERE id = ?').get(articleId)).toBeDefined();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('clears only expired audio and keeps transcripts and published news', async () => {
    const oldDate = '2025-06-01';
    const { articleId } = await startXinwenlianboTask(oldDate, { durationMinutes: 1 }).completion;
    const db = getDb();
    const oldDir = mkdtempSync(join(tmpdir(), 'xinwenlianbo-'));
    const recentDir = mkdtempSync(join(tmpdir(), 'xinwenlianbo-'));
    const oldAudio = join(oldDir, 'recording.wav');
    const recentAudio = join(recentDir, 'recording.wav');
    try {
      writeFileSync(oldAudio, 'old recording');
      writeFileSync(recentAudio, 'recent recording');
      db.prepare("UPDATE xinwenlianbo_tasks SET startedAt = '2025-06-01 00:00:00', audioFilePath = ? WHERE taskDate = ?")
        .run(oldAudio, oldDate);
      db.prepare(`
        INSERT INTO xinwenlianbo_tasks (taskDate, status, startedAt, audioFilePath)
        VALUES ('2025-06-02', 'completed', '2025-06-02 00:00:00', ?)
      `).run(recentAudio);

      const now = new Date('2025-06-17T00:00:00Z');
      expect(cleanupExpiredXinwenlianboAudio(now)).toBe(1);
      expect(cleanupExpiredXinwenlianboAudio(now)).toBe(0);
      expect(existsSync(oldAudio)).toBe(false);
      expect(existsSync(recentAudio)).toBe(true);
      expect(db.prepare('SELECT audioFilePath, transcript FROM xinwenlianbo_tasks WHERE taskDate = ?').get(oldDate))
        .toEqual({ audioFilePath: null, transcript: '测试转录' });
      expect(db.prepare('SELECT id FROM articles WHERE id = ?').get(articleId)).toBeDefined();
    } finally {
      rmSync(oldDir, { recursive: true, force: true });
      rmSync(recentDir, { recursive: true, force: true });
    }
  });

  it('extracts opening headlines when the recording has no configured summary model', async () => {
    transcribe.mockResolvedValueOnce('各位好，今天新闻联播的主要内容有：第一条新闻。第二条新闻。第一条新闻。下面请看详细报道。其他正文。');
    const { articleId } = await startXinwenlianboTask(getXinwenlianboDate(), { durationMinutes: 1 }).completion;
    const { headlines } = getDb().prepare('SELECT headlines FROM articles WHERE id = ?').get(articleId);
    expect(JSON.parse(headlines)).toEqual(['第一条新闻', '第二条新闻']);
  });

  it('deletes the generated news only on request and rolls back on an invalid audio path', async () => {
    const date = getXinwenlianboDate();
    const { articleId } = await startXinwenlianboTask(date, { durationMinutes: 1 }).completion;
    const { id } = listXinwenlianboRecords(1, 10).items[0];
    const unrelatedFile = new URL(import.meta.url).pathname;
    getDb().prepare('UPDATE xinwenlianbo_tasks SET audioFilePath = ? WHERE id = ?').run(unrelatedFile, id);

    expect(() => deleteXinwenlianboRecord(id, { deleteArticle: true })).toThrow('路径异常');
    expect(getXinwenlianboRecord(id).articleId).toBe(articleId);
    expect(existsSync(unrelatedFile)).toBe(true);

    getDb().prepare('UPDATE xinwenlianbo_tasks SET audioFilePath = NULL WHERE id = ?').run(id);
    expect(deleteXinwenlianboRecord(id, { deleteArticle: true })).toEqual({ articleDeleted: true });
    expect(getXinwenlianboRecord(id)).toBeNull();
    expect(getDb().prepare('SELECT id FROM articles WHERE id = ?').get(articleId)).toBeUndefined();
  });
});
