import { jest } from '@jest/globals';
import { getDb, closeDb } from '../src/db.js';
import { insertSource, getAllSources } from '../src/models/source.js';
import { listArticles } from '../src/models/article.js';
import { crawlSource, crawlAllSources, normalizeArticle } from '../src/services/crawler.js';
import { triggerManualCrawl, triggerManualCrawlForSource } from '../src/services/scheduler.js';

const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Feed</title>
  <item><title>Item 1</title><link>http://example.com/1</link>
    <pubDate>Wed, 18 Nov 2026 12:00:00 GMT</pubDate></item>
  <item><title> </title><link>http://example.com/empty</link></item>
  <item><title>Item 2</title><link>http://example.com/2</link></item>
  <item><title>Invalid link</title><link>javascript:void(0)</link></item>
</channel></rss>`;

function addSource(name = 'Source', url = 'https://example.org/feed') {
  return insertSource({ name, rssUrl: url, category: 'general' });
}

describe('Crawler', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    getDb();
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url === 'http://fail.com/rss') return new Response(null, { status: 404 });
      return new Response(rss);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    closeDb();
    delete process.env.DB_PATH;
  });

  it('normalizes text, relative links and publication dates', () => {
    expect(normalizeArticle({
      title: { _: ' 相对链接 ' }, contentSnippet: ' 摘要 ', link: '/news/1',
      isoDate: 'invalid', pubDate: 'Wed, 18 Nov 2026 12:00:00 GMT'
    }, 1, 'https://example.org/feed')).toMatchObject({
      title: '相对链接',
      summary: '摘要',
      originalUrl: 'https://example.org/news/1',
      sourceId: 1,
      publishedAt: '2026-11-18T12:00:00.000Z'
    });
  });

  it('skips invalid items and does not count duplicate articles as new', async () => {
    addSource();
    const [source] = getAllSources();
    expect(await crawlSource(source)).toHaveLength(2);
    expect(listArticles().items).toHaveLength(2);
    expect(await crawlSource(source)).toEqual([]);
  });

  it('isolates a 404 and leaves it unretried', async () => {
    addSource();
    addSource('Bad', 'http://fail.com/rss');
    const results = await crawlAllSources(getAllSources());
    expect(results).toHaveLength(2);
    expect(results[0].count).toBe(2);
    expect(results[1]).toMatchObject({ error: expect.stringContaining('404'), errorType: 'http' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries temporary HTTP errors but skips retries on invalid XML', async () => {
    addSource();
    const [source] = getAllSources();
    fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await crawlSource(source)).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);

    fetch.mockResolvedValueOnce(new Response('<html>不是 RSS</html>'));
    await expect(crawlSource(source)).rejects.toMatchObject({ type: 'parse' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry immediately when the publisher requests a longer wait', async () => {
    addSource();
    fetch.mockResolvedValueOnce(new Response(null, { status: 429, headers: { 'Retry-After': '60' } }));
    await expect(crawlSource(getAllSources()[0])).rejects.toMatchObject({ type: 'http' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shares an overlapping batch and single-source request', async () => {
    const id = addSource();
    const [first, second, single] = await Promise.all([
      triggerManualCrawl(), triggerManualCrawl(), triggerManualCrawlForSource(id)
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(single).toEqual(first[0]);
  });
});
