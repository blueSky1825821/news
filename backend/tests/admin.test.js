import request from 'supertest';
import { app } from '../src/app.js';
import { closeDb } from '../src/db.js';

describe('Administrator access', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    process.env.ADMIN_EMAILS = 'admin@example.com';
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
    delete process.env.ADMIN_EMAILS;
  });

  async function register(email, extra = {}) {
    const res = await request(app).post('/api/auth/register')
      .send({ email, password: 'password123', ...extra });
    expect(res.status).toBe(200);
    return res.body.data;
  }

  it('does not allow registration to grant administrator privileges', async () => {
    const data = await register('user@example.com', { role: 'admin', isAdmin: true });
    expect(data.user.role).toBe('user');
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'password123', adminLogin: true });
    expect(login.status).toBe(403);
  });

  it('protects source management, settings and crawl endpoints on both prefixes', async () => {
    const { token } = await register('user@example.com');
    for (const prefix of ['/api', '/news/api']) {
      for (const [method, route] of [
        ['get', '/sources/health'], ['post', '/sources/1/activate'],
        ['delete', '/sources/1'], ['get', '/settings/failure-threshold'],
        ['put', '/settings/failure-threshold'], ['post', '/crawl/trigger'],
        ['post', '/crawl/sources/1'], ['post', '/crawl/cleanup/trigger']
      ]) {
        expect((await request(app)[method](prefix + route)).status).toBe(401);
        expect((await request(app)[method](prefix + route)
          .set('Authorization', `Bearer ${token}`)).status).toBe(403);
      }
      expect((await request(app).get(prefix + '/sources')).status).toBe(200);
    }
  });

  it('allows configured administrators and checks current permissions for existing tokens', async () => {
    const { token, user } = await register('admin@example.com');
    expect(user.role).toBe('admin');
    const login = await request(app).post('/api/auth/login')
      .send({ email: user.email, password: 'password123', adminLogin: true });
    expect(login.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.data.user.role).toBe('admin');
    const health = () => request(app).get('/api/sources/health').set('Authorization', `Bearer ${token}`);
    expect((await health()).status).toBe(200);
    process.env.ADMIN_EMAILS = '';
    expect((await health()).status).toBe(403);
  });
});
