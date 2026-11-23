import { jest } from '@jest/globals';
import { createTrendsService } from '../src/services/trends.js';

const longId = '2106822157141534109';
const fetchTrends = (url) => {
  const { hostname: host, pathname } = new URL(url);
  if (host === 'weibo.com') return new Response(null, { status: 403 });
  if (host === 'tunbang.com') {
    const [title, href] = {
      '/hot/weibo': ['微博 &amp; 热搜', 'https://s.weibo.com/'],
      '/hot/bilibili/': ['B 站视频', 'https://b23.tv/BV1abcd23456'],
      '/hot/douyin': ['抖音话题', 'https://www.douyin.com/hot/123']
    }[pathname];
    return new Response(`<ol id="list"><li><a class="row-title" href="${href}">${title}</a><span class="hot">112万</span></li></ol>`);
  }
  if (host === 'movie.douban.com') return new Response(`
    <tr class="item"><td><a class="nbg" href="https://movie.douban.com/subject/567/" title="豆瓣新片"></a></td>
    <td><span class="rating_nums">8.6</span></td></tr>`);
  if (host === 'api.juejin.cn') return Response.json({ data: [
    { content: { content_id: longId, title: '掘金文章', brief: '文章简介' }, content_counter: { hot_rank: 108 } }
  ] });
  if (host === 'api.zhihu.com') return Response.json({
    data: [{ target: { title: '知乎问题', excerpt: '话题摘要', url: `https://api.zhihu.com/questions/${longId}` }, detail_text: '100 万热度' }]
  });
  return new Response(`<!--s-data:${JSON.stringify({ data: { cards: [{ content: [
    { isTop: true, word: '置顶' }, { word: '百度热搜', hotScore: '900' }
  ] }] } })}-->`);
};

describe('trends service', () => {
  it('normalizes all seven boards and preserves original links and provider attribution', async () => {
    const getTrends = createTrendsService({ fetcher: fetchTrends });
    const { boards } = await getTrends();
    expect(boards.map(({ id, status }) => [id, status])).toEqual([
      ['weibo', 'ready'], ['zhihu', 'ready'], ['baidu', 'ready'], ['bilibili', 'ready'],
      ['douyin', 'ready'], ['douban', 'ready'], ['juejin', 'ready']
    ]);
    expect(boards[0]).toMatchObject({ provider: '豚榜', items: [{ rank: 1, title: '微博 & 热搜', heat: '112万' }] });
    expect(boards[1].items[0]).toMatchObject({ url: `https://www.zhihu.com/question/${longId}`, description: '话题摘要' });
    expect(boards[2].items).toMatchObject([{ rank: 1, title: '百度热搜' }]);
    expect(boards[3]).toMatchObject({ provider: '豚榜', items: [{ url: 'https://www.bilibili.com/video/BV1abcd23456/' }] });
    expect(boards[4]).toMatchObject({ provider: '豚榜', items: [{ url: 'https://www.douyin.com/hot/123' }] });
    expect(boards[5].items[0]).toMatchObject({ url: 'https://movie.douban.com/subject/567/', heat: '评分 8.6' });
    expect(boards[6].items[0]).toMatchObject({ url: `https://juejin.cn/post/${longId}`, heat: '108', description: '文章简介' });
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
    expect(fetcher).toHaveBeenCalledTimes(8);

    await getTrends({ refresh: true });
    expect(fetcher).toHaveBeenCalledTimes(8);

    time += 60_000;
    failZhihu = true;
    const { boards } = await getTrends({ refresh: true });
    expect(boards.map(board => board.status)).toEqual(['ready', 'stale', 'ready', 'ready', 'ready', 'ready', 'ready']);
    expect(boards[1].updatedAt).toBe(first.boards[1].updatedAt);

    time += 24 * 60 * 60_000;
    const expired = await getTrends();
    expect(expired.boards[1]).toMatchObject({ status: 'unavailable', items: [], updatedAt: null });
  });
});
