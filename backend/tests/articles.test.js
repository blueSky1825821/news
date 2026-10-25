import { jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/app.js';
import { getDb, closeDb, initSchema } from '../src/db.js';
import { insertSource, getAllSources } from '../src/models/source.js';
import { insertArticle } from '../src/models/article.js';

jest.unstable_mockModule('rss-parser', () => ({
  default: class Parser {
    async parseURL() {
      return {
        items: [
          { title: 'Mock Item', link: 'http://example.com/mock', isoDate: new Date().toISOString() }
        ]
      };
    }
  }
}));

describe('Articles API', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
    insertSource({ name: 'Test', rssUrl: 'http://test.com/rss', category: 'tech', isActive: 1 });
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('GET /api/articles returns list', async () => {
    const source = getAllSources()[0];
    insertArticle({ title: 'A1', originalUrl: 'http://a.com/1', sourceId: source.id, publishedAt: new Date().toISOString() });
    const res = await request(app).get('/api/articles');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.items.length).toBe(1);
    expect(res.body.data.pagination.total).toBe(1);
  });

  it('GET /api/articles/:id returns article', async () => {
    const source = getAllSources()[0];
    const id = insertArticle({ title: 'A1', originalUrl: 'http://a.com/1', sourceId: source.id, publishedAt: new Date().toISOString() });
    const res = await request(app).get('/api/articles/' + id);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.title).toBe('A1');
  });

  it('GET /api/articles/:id returns 404 for unknown', async () => {
    const res = await request(app).get('/api/articles/9999');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(1001);
  });

  it('GET /api/sources returns list', async () => {
    const res = await request(app).get('/api/sources');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /api/crawl/trigger returns results', async () => {
    const res = await request(app).post('/api/crawl/trigger');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toContain('Crawl finished');
    expect(Array.isArray(res.body.data.results)).toBe(true);
  }, 30000);
});
