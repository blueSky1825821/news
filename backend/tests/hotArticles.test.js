import request from 'supertest';
import { app } from '../src/app.js';
import { getDb, closeDb, initSchema } from '../src/db.js';

describe('Hot Articles API', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('GET /api/articles/hot should return hot articles for today', async () => {
    const res = await request(app).get('/api/articles/hot?range=today');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.pagination).toBeDefined();
  });

  it('GET /api/articles/hot should return hot articles for week', async () => {
    const res = await request(app).get('/api/articles/hot?range=week');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('GET /api/articles/hot-sidebar should return top 5 hot articles', async () => {
    const res = await request(app).get('/api/articles/hot-sidebar');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeLessThanOrEqual(5);
  });
});
