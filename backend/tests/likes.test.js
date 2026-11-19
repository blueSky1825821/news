import request from 'supertest';
import { app } from '../src/app.js';
import { getDb, closeDb, initSchema } from '../src/db.js';

async function createTestArticle() {
  const db = getDb();
  db.prepare(`INSERT OR IGNORE INTO sources (name, rssUrl, category) VALUES (?, ?, ?)`).run('TestSource', 'http://test.com/rss', 'test');
  const source = db.prepare(`SELECT id FROM sources WHERE rssUrl = ?`).get('http://test.com/rss');
  const result = db.prepare(`INSERT INTO articles (title, originalUrl, sourceId, publishedAt) VALUES (?, ?, ?, ?)`)
    .run('Test Article', 'http://test.com/1', source.id, new Date().toISOString());
  return result.lastInsertRowid;
}

async function createTestUser(email, password) {
  const db = getDb();
  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.default.hash(password, 10);
  const result = db.prepare(`INSERT INTO users (email, passwordHash, emailVerified) VALUES (?, ?, 1)`).run(email, hash);
  return result.lastInsertRowid;
}

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.data.token;
}

describe('Likes API', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('POST /api/articles/:id/like should like an article', async () => {
    const articleId = await createTestArticle();
    await createTestUser('likeuser@test.com', 'password123');
    const token = await login('likeuser@test.com', 'password123');
    const res = await request(app).post(`/api/articles/${articleId}/likes`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(true);
    expect(res.body.data.likeCount).toBe(1);
  });

  it('POST /api/articles/:id/like should toggle off when liked again', async () => {
    const articleId = await createTestArticle();
    await createTestUser('likeuser2@test.com', 'password123');
    const token = await login('likeuser2@test.com', 'password123');
    await request(app).post(`/api/articles/${articleId}/likes`).set('Authorization', `Bearer ${token}`);
    const res = await request(app).post(`/api/articles/${articleId}/likes`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(false);
    expect(res.body.data.likeCount).toBe(0);
  });

  it('POST /api/articles/:id/like should reject unverified email', async () => {
    const db = getDb();
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.default.hash('password123', 10);
    db.prepare(`INSERT INTO users (email, passwordHash, emailVerified) VALUES (?, ?, 0)`).run('unverified@test.com', hash);
    const token = await login('unverified@test.com', 'password123');
    const articleId = await createTestArticle();
    const res = await request(app).post(`/api/articles/${articleId}/likes`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe(1023);
  });

  it('GET /api/articles/:id/likes should return like users', async () => {
    const articleId = await createTestArticle();
    const res = await request(app).get(`/api/articles/${articleId}/likes`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.users)).toBe(true);
  });

  it('GET /api/articles/:id/liked should return liked status', async () => {
    const articleId = await createTestArticle();
    await createTestUser('likeduser@test.com', 'password123');
    const token = await login('likeduser@test.com', 'password123');
    const res = await request(app).get(`/api/articles/${articleId}/likes/liked`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.liked).toBe(false);
  });
});
