import { getDb, closeDb, initSchema } from '../src/db.js';
import { getAllSources, getActiveSources, insertSource } from '../src/models/source.js';
import { listArticles, getArticleById, insertArticle } from '../src/models/article.js';

describe('Database Layer', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  describe('initSchema', () => {
    it('should create sources table', () => {
      const db = getDb();
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sources'").all();
      expect(tables.length).toBe(1);
    });

    it('should create articles table', () => {
      const db = getDb();
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='articles'").all();
      expect(tables.length).toBe(1);
    });

    it('initializes wechat-related tables', () => {
      const db = getDb();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('wechat_settings', 'wechat_push_logs', 'article_flags')"
      ).all();
      expect(tables.length).toBe(3);
    });

    it('initializes auth-related tables', () => {
      const db = getDb();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'user_categories')"
      ).all();
      expect(tables.length).toBe(2);
    });

    it('initializes source_health table', () => {
      const db = getDb();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='source_health'"
      ).all();
      expect(tables.length).toBe(1);
    });
  });

  describe('source model', () => {
    it('insertSource and getAllSources', () => {
      insertSource({ name: 'Test Source', rssUrl: 'http://example.com/rss', category: 'test', isActive: 1 });
      const sources = getAllSources();
      expect(sources.length).toBe(1);
      expect(sources[0].name).toBe('Test Source');
      expect(sources[0].rssUrl).toBe('http://example.com/rss');
      expect(sources[0].category).toBe('test');
      expect(sources[0].isActive).toBe(1);
    });

    it('getActiveSources filters inactive sources', () => {
      insertSource({ name: 'Active', rssUrl: 'http://a.com/rss', category: 'test', isActive: 1 });
      insertSource({ name: 'Inactive', rssUrl: 'http://b.com/rss', category: 'test', isActive: 0 });
      const active = getActiveSources();
      expect(active.length).toBe(1);
      expect(active[0].name).toBe('Active');
    });
  });

  describe('article model', () => {
    it('insertArticle and listArticles', () => {
      insertSource({ name: 'Src', rssUrl: 'http://s.com/rss', category: 'test', isActive: 1 });
      const source = getAllSources()[0];
      insertArticle({
        title: 'Title',
        summary: 'Summary',
        content: 'Content',
        originalUrl: 'http://example.com/article',
        sourceId: source.id,
        publishedAt: new Date().toISOString()
      });
      const articles = listArticles();
      expect(articles.items.length).toBe(1);
      expect(articles.items[0].title).toBe('Title');
    });

    it('getArticleById returns article or null', () => {
      insertSource({ name: 'Src', rssUrl: 'http://s.com/rss', category: 'test', isActive: 1 });
      const source = getAllSources()[0];
      insertArticle({
        title: 'Title',
        summary: 'Summary',
        originalUrl: 'http://example.com/article',
        sourceId: source.id,
        publishedAt: new Date().toISOString()
      });
      const article = listArticles().items[0];
      expect(getArticleById(article.id)).not.toBeNull();
      expect(getArticleById(999)).toBeNull();
    });

    it('listArticles supports pagination and filtering', () => {
      insertSource({ name: 'Src', rssUrl: 'http://s.com/rss', category: 'cat1', isActive: 1 });
      const source = getAllSources()[0];
      for (let i = 0; i < 5; i++) {
        insertArticle({
          title: 'Article ' + i,
          originalUrl: 'http://example.com/' + i,
          sourceId: source.id,
          publishedAt: new Date().toISOString()
        });
      }
      const p1 = listArticles({ page: 1, limit: 2 });
      expect(p1.items.length).toBe(2);
      expect(p1.pagination.total).toBe(5);

      const filtered = listArticles({ sourceId: source.id });
      expect(filtered.items.length).toBe(5);
    });
  });
});