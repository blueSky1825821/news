import { jest } from '@jest/globals';
import { getDb, closeDb, initSchema } from '../src/db.js';
import { insertSource, getAllSources } from '../src/models/source.js';
import { listArticles } from '../src/models/article.js';

jest.unstable_mockModule('rss-parser', () => ({
  default: class Parser {
    async parseURL(url) {
      if (url === 'http://fail.com/rss') throw new Error('Network error');
      return {
        items: [
          { title: 'Item 1', link: 'http://example.com/1', isoDate: new Date().toISOString() },
          { title: '  ', link: 'http://example.com/empty', isoDate: new Date().toISOString() },
          { title: 'Item 2', link: 'http://example.com/2', isoDate: new Date().toISOString() }
        ]
      };
    }
  }
}));

const { crawlSource, crawlAllSources, normalizeArticle } = await import('../src/services/crawler.js');

describe('Crawler', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('normalizeArticle normalizes fields', () => {
    const article = normalizeArticle({ title: ' T ', contentSnippet: ' S ', link: 'http://x.com' }, 1);
    expect(article.title).toBe('T');
    expect(article.summary).toBe('S');
    expect(article.originalUrl).toBe('http://x.com');
    expect(article.sourceId).toBe(1);
  });

  it('crawlSource inserts articles and skips empty titles', async () => {
    insertSource({ name: 'Src', rssUrl: 'http://s.com/rss', category: 'test', isActive: 1 });
    const source = getAllSources()[0];
    const results = await crawlSource(source);
    expect(results.length).toBe(2);
    const articles = listArticles();
    expect(articles.items.length).toBe(2);
  });

  it('crawlAllSources isolates errors', async () => {
    insertSource({ name: 'Good', rssUrl: 'http://good.com/rss', category: 'test', isActive: 1 });
    insertSource({ name: 'Bad', rssUrl: 'http://fail.com/rss', category: 'test', isActive: 1 });
    const sources = getAllSources();
    const results = await crawlAllSources(sources);
    expect(results.length).toBe(2);
    expect(results[0].count).toBe(2);
    expect(results[1].error).toBe('Network error');
  }, 10000);
});
