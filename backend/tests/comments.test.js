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

async function createTestUser(email, password, verified = 1) {
  const db = getDb();
  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.default.hash(password, 10);
  const result = db.prepare(`INSERT INTO users (email, passwordHash, emailVerified) VALUES (?, ?, ?)`).run(email, hash, verified);
  return result.lastInsertRowid;
}

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.data.token;
}

describe('Comments API', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('POST /api/articles/:id/comments should create a comment', async () => {
    const articleId = await createTestArticle();
    await createTestUser('commenter@test.com', 'password123');
    const token = await login('commenter@test.com', 'password123');
    const res = await request(app).post(`/api/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Great article!' });
    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe('Great article!');
  });

  it('POST /api/articles/:id/comments should reject empty content', async () => {
    const articleId = await createTestArticle();
    await createTestUser('commenter2@test.com', 'password123');
    const token = await login('commenter2@test.com', 'password123');
    const res = await request(app).post(`/api/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: '' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1025);
  });

  it('POST /api/comments/:id/reply should reply to a comment', async () => {
    const articleId = await createTestArticle();
    await createTestUser('replier@test.com', 'password123');
    const token = await login('replier@test.com', 'password123');
    const commentRes = await request(app).post(`/api/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Parent comment' });
    const replyRes = await request(app).post(`/api/comments/${commentRes.body.data.id}/reply`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Reply content' });
    expect(replyRes.status).toBe(200);
    expect(replyRes.body.data.parentId).toBe(commentRes.body.data.id);
  });

  it('GET /api/articles/:id/comments should return comments', async () => {
    const articleId = await createTestArticle();
    const res = await request(app).get(`/api/articles/${articleId}/comments`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.comments)).toBe(true);
  });

  it('POST /api/comments/:id/report should report a comment', async () => {
    const articleId = await createTestArticle();
    await createTestUser('reporter@test.com', 'password123');
    const token = await login('reporter@test.com', 'password123');
    const commentRes = await request(app).post(`/api/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Report me' });
    const reportRes = await request(app).post(`/api/comments/${commentRes.body.data.id}/report`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'spam' });
    expect(reportRes.status).toBe(200);
  });

  it('POST /api/comments/:id/report should reject duplicate report', async () => {
    const articleId = await createTestArticle();
    await createTestUser('reporter2@test.com', 'password123');
    const token = await login('reporter2@test.com', 'password123');
    const commentRes = await request(app).post(`/api/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Report me twice' });
    await request(app).post(`/api/comments/${commentRes.body.data.id}/report`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'spam' });
    const res2 = await request(app).post(`/api/comments/${commentRes.body.data.id}/report`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'spam' });
    expect(res2.status).toBe(409);
    expect(res2.body.code).toBe(1024);
  });
});
