import request from 'supertest';
import { app } from '../src/app.js';
import { getDb, closeDb, initSchema } from '../src/db.js';
import { createVerificationToken, findVerificationToken } from '../src/models/emailVerification.js';
import { createPasswordResetToken } from '../src/models/passwordReset.js';

describe('Auth API', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('POST /api/auth/register creates a user and returns token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.user.email).toBe('test@example.com');
    expect(res.body.data.token).toBeDefined();
    expect(Array.isArray(res.body.data.user.categories)).toBe(true);
  });

  it('POST /api/auth/register stores selected categories', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123', categories: ['tech', 'business'] });

    expect(res.status).toBe(200);
    expect(res.body.data.user.categories.sort()).toEqual(['business', 'tech']);
  });

  it('POST /api/auth/register rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe(1007);
  });

  it('POST /api/auth/register rejects invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1005);
  });

  it('POST /api/auth/register rejects short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1006);
  });

  it('POST /api/auth/login returns token for valid credentials', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123', categories: ['tech'] });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.user.email).toBe('test@example.com');
    expect(res.body.data.user.categories).toEqual(['tech']);
    expect(res.body.data.token).toBeDefined();
  });

  it('POST /api/auth/login rejects invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1009);
  });

  it('GET /api/auth/me requires token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1003);
  });

  it('GET /api/auth/me returns current user with valid token', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123', categories: ['tech'] });

    const token = registerRes.body.data.token;

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.user.email).toBe('test@example.com');
    expect(res.body.data.user.categories).toEqual(['tech']);
    expect(res.body.data.user.emailVerified).toBe(0);
  });

  it('POST /api/auth/verify-email verifies with valid token', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'verify@test.com', password: 'password123' });
    const userId = registerRes.body.data.user.id;
    const token = createVerificationToken(userId);

    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registerRes.body.data.token}`);
    expect(meRes.body.data.user.emailVerified).toBe(1);
  });

  it('POST /api/auth/verify-email rejects invalid token', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(1020);
  });

  it('POST /api/auth/resend-verification sends new token', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'resend@test.com', password: 'password123' });
    const token = registerRes.body.data.token;

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it('POST /api/auth/forgot-password returns success for any email', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nonexistent@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
  });

  it('POST /api/auth/reset-password resets with valid token', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'reset@test.com', password: 'password123' });
    const userId = registerRes.body.data.user.id;
    const token = createPasswordResetToken(userId);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'newpassword123' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'reset@test.com', password: 'newpassword123' });
    expect(loginRes.status).toBe(200);
  });

  it('PUT /api/auth/change-password rejects wrong old password', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'changepw@test.com', password: 'password123' });
    const token = registerRes.body.data.token;

    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: 'wrong', newPassword: 'newpassword123' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe(1009);
  });

  it('PUT /api/auth/change-password changes password with correct old password', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'changepw2@test.com', password: 'password123' });
    const token = registerRes.body.data.token;

    const res = await request(app)
      .put('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: 'password123', newPassword: 'newpassword123' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'changepw2@test.com', password: 'newpassword123' });
    expect(loginRes.status).toBe(200);
  });
});
