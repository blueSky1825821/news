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
    delete process.env.ADMIN_EMAILS;
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

  it('combines a Beijing publication date, search terms, source and a requested page', async () => {
    const sourceId = getAllSources()[0].id;
    const add = (suffix, publishedAt, summary = '市场 AI') => insertArticle({
      title: `行业观察 ${suffix}`, summary, sourceId, originalUrl: `https://example.com/${suffix}`, publishedAt
    });
    const midnight = add('midnight', '2026-11-22T16:00:00.000Z');
    add('evening', '2026-11-23T15:59:59.000Z');
    add('before', '2026-11-22T15:59:59.000Z');
    add('after', '2026-11-23T16:00:00.000Z');
    add('missing-term', '2026-11-23T10:00:00.000Z', '市场');
    add('undated', null);

    const result = await request(app).get('/api/articles').query({
      date: '2026-11-23', q: '行业 ai', sourceId, category: 'tech', page: 2, limit: 1, view: 'card'
    });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ items: [{ id: midnight }], pagination: { page: 2, total: 2, totalPages: 2 } });
    expect((await request(app).get('/api/articles?date=2026-02-30')).status).toBe(400);
  });

  it('returns compact cards with like counts and viewer-specific state', async () => {
    const source = getAllSources()[0];
    const id = insertArticle({ title: 'A1', summary: 'Summary', content: '<p>Full article</p>',
      originalUrl: 'http://a.com/cards', sourceId: source.id, publishedAt: new Date().toISOString() });
    const auth = await request(app).post('/api/auth/register')
      .send({ email: 'cards@example.com', password: 'password123' });
    const { user, token } = auth.body.data;
    getDb().prepare('INSERT INTO article_likes (articleId, userId) VALUES (?, ?)').run(id, user.id);

    const guest = await request(app).get('/api/articles?view=card');
    const viewer = await request(app).get('/api/articles/today?view=card').set('Authorization', `Bearer ${token}`);
    const detail = await request(app).get(`/api/articles/${id}?includeLikes=1`).set('Authorization', `Bearer ${token}`);
    const full = await request(app).get('/api/articles');

    expect(guest.body.data.items[0]).toMatchObject({ id, likeCount: 1, liked: false });
    expect(viewer.body.data.items[0]).toMatchObject({ id, likeCount: 1, liked: true, summary: 'Summary' });
    expect(viewer.body.data.items[0]).not.toHaveProperty('content');
    expect(viewer.headers['cache-control']).toBe('private, no-store');
    expect(detail.body.data).toMatchObject({ id, content: '<p>Full article</p>', likeCount: 1, liked: true });
    expect(full.body.data.items[0]).toHaveProperty('content', '<p>Full article</p>');
  });

  it('paginates recent articles in publication order without including older fetches', async () => {
    const source = getAllSources()[0];
    const newest = insertArticle({ title: 'New', originalUrl: 'http://a.com/new', sourceId: source.id, publishedAt: '2026-01-03' });
    const second = insertArticle({ title: 'Second', originalUrl: 'http://a.com/second', sourceId: source.id, publishedAt: '2026-01-02' });
    const expired = insertArticle({ title: 'Expired', originalUrl: 'http://a.com/expired', sourceId: source.id, publishedAt: '2026-01-04' });
    getDb().prepare("UPDATE articles SET fetchedAt = datetime('now', '-25 hours') WHERE id = ?").run(expired);

    const firstPage = await request(app).get('/api/articles/today?limit=1');
    const nextPage = await request(app).get('/api/articles/today?limit=1&page=2');
    expect(firstPage.body.data).toMatchObject({ items: [{ id: newest }], pagination: { total: 2, totalPages: 2 } });
    expect(nextPage.body.data).toMatchObject({ items: [{ id: second }], pagination: { page: 2, total: 2 } });
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
    process.env.ADMIN_EMAILS = 'admin@example.com';
    const auth = await request(app).post('/api/auth/register')
      .send({ email: 'admin@example.com', password: 'password123' });
    const res = await request(app).post('/api/crawl/trigger')
      .set('Authorization', `Bearer ${auth.body.data.token}`);
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.message).toContain('Crawl finished');
    expect(Array.isArray(res.body.data.results)).toBe(true);
  }, 30000);
});
