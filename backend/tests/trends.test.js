import { jest } from '@jest/globals';
import { createTrendsService } from '../src/services/trends.js';

const longId = '2106822157141534109';
const fetchTrends = (url) => {
  const host = new URL(url).hostname;
  if (host === 'weibo.com') return new Response(null, { status: 403 });
  if (host === 'tunbang.com') return new Response(`
    <ol id="list"><li><a class="row-title">微博 &amp; 热搜</a><span class="hot">112万</span></li></ol>`);
  if (host === 'api.zhihu.com') return Response.json({
    data: [{ target: { title: '知乎问题', excerpt: '话题摘要', url: `https://api.zhihu.com/questions/${longId}` }, detail_text: '100 万热度' }]
  });
  return new Response(`<!--s-data:${JSON.stringify({ data: { cards: [{ content: [
    { isTop: true, word: '置顶' }, { word: '百度热搜', hotScore: '900' }
  ] }] } })}-->`);
};

describe('trends service', () => {
  it('normalizes all three boards and uses the disclosed fallback when Weibo rejects access', async () => {
    const getTrends = createTrendsService({ fetcher: fetchTrends });
    const { boards } = await getTrends();
    expect(boards.map(({ id, status }) => [id, status])).toEqual([
      ['weibo', 'ready'], ['zhihu', 'ready'], ['baidu', 'ready']
    ]);
    expect(boards[0]).toMatchObject({ provider: '豚榜', items: [{ rank: 1, title: '微博 & 热搜', heat: '112万' }] });
    expect(boards[1].items[0]).toMatchObject({ url: `https://www.zhihu.com/question/${longId}`, description: '话题摘要' });
    expect(boards[2].items).toMatchObject([{ rank: 1, title: '百度热搜' }]);
  });

  it('coalesces refreshes and isolates failures while reusing the last successful board', async () => {
    let time = 0;
    let failZhihu = false;
    const fetcher = jest.fn(async url => {
      if (failZhihu && url.includes('api.zhihu.com')) throw new Error('Timed out');
      return fetchTrends(url);
    });
    const getTrends = createTrendsService({ fetcher, now: () => time });
    const [first, second] = await Promise.all([getTrends(), getTrends({ refresh: true })]);
    expect(first).toEqual(second);
    expect(fetcher).toHaveBeenCalledTimes(4);

    await getTrends({ refresh: true });
    expect(fetcher).toHaveBeenCalledTimes(4);

    time += 60_000;
    failZhihu = true;
    const { boards } = await getTrends({ refresh: true });
    expect(boards.map(board => board.status)).toEqual(['ready', 'stale', 'ready']);
    expect(boards[1].updatedAt).toBe(first.boards[1].updatedAt);

    time += 24 * 60 * 60_000;
    const expired = await getTrends();
    expect(expired.boards[1]).toMatchObject({ status: 'unavailable', items: [], updatedAt: null });
  });
});
