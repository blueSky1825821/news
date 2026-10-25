import request from 'supertest';
import { app } from '../src/app.js';
import { getDb, closeDb, initSchema } from '../src/db.js';

describe('User Categories API', () => {
  let token;

  beforeEach(async () => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123', categories: ['tech'] });

    token = res.body.data.token;
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('GET /api/users/categories returns current categories', async () => {
    const res = await request(app)
      .get('/api/users/categories')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.categories).toEqual(['tech']);
  });

  it('PUT /api/users/categories replaces categories', async () => {
    const res = await request(app)
      .put('/api/users/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ categories: ['business', 'science'] });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.categories).toEqual(['business', 'science']);
  });

  it('PUT /api/users/categories ignores unknown categories', async () => {
    const res = await request(app)
      .put('/api/users/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ categories: ['tech', 'not-a-category'] });

    expect(res.status).toBe(200);
    expect(res.body.data.categories).toEqual(['tech']);
  });

  it('GET /api/users/categories requires auth', async () => {
    const res = await request(app).get('/api/users/categories');
    expect(res.status).toBe(401);
  });
});
