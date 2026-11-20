import request from 'supertest';
import { app } from '../src/app.js';
import { getDb, closeDb, initSchema } from '../src/db.js';

describe('Users API', () => {
  let token;

  beforeEach(async () => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'profile@example.com', password: 'password123' });
    token = res.body.data.token;
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  describe('GET /api/users/profile', () => {
    it('should return user profile with new fields', async () => {
      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.user).toHaveProperty('displayName');
      expect(res.body.data.user).toHaveProperty('bio');
      expect(res.body.data.user).toHaveProperty('avatarUrl');
      expect(res.body.data.user.email).toBe('profile@example.com');
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/users/profile');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should update displayName and bio', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Test User', bio: 'Hello world' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe(0);
      expect(res.body.data.user.displayName).toBe('Test User');
      expect(res.body.data.user.bio).toBe('Hello world');
    });

    it('should trim displayName and bio', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: '  Trimmed  ', bio: '  Bio  ' });
      expect(res.status).toBe(200);
      expect(res.body.data.user.displayName).toBe('Trimmed');
      expect(res.body.data.user.bio).toBe('Bio');
    });

    it('should reject displayName > 50 chars', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'a'.repeat(51) });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1030);
    });

    it('should reject bio > 200 chars', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ bio: 'a'.repeat(201) });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1031);
    });
  });

  describe('POST /api/users/avatar', () => {
    it('should return 400 without file', async () => {
      const res = await request(app)
        .post('/api/users/avatar')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1032);
    });
  });
});
