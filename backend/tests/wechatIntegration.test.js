import { jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/app.js';
import { getDb, closeDb } from '../src/db.js';
import { setWechatSettings } from '../src/models/wechatSettings.js';
import { findOrCreateWechatUser } from '../src/models/user.js';
import { generateToken } from '../src/middleware/auth.js';
import { stopSummaryPushScheduler } from '../src/services/scheduler.js';
import { getRecentArticles } from '../src/models/article.js';
import { createPush, pushSummary } from '../src/services/wechat.js';

describe('WeChat OAuth and publishing', () => {
  let fetchMock;
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    process.env.PUBLIC_BASE_URL = 'https://news.example.com/news';
    process.env.ADMIN_EMAILS = 'admin@example.com';
    process.env.WECHAT_OAUTH_ENABLED = 'true';
    process.env.WECHAT_MASS_SEND_ENABLED = 'true';
    getDb();
    setWechatSettings({ appId: 'wx123', appSecret: 'secret', previewOpenId: 'preview-openid' });
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ errcode: 0, msg_id: 'msg-1' }) });
  });
  afterEach(() => {
    stopSummaryPushScheduler();
    closeDb();
    for (const key of ['DB_PATH', 'PUBLIC_BASE_URL', 'ADMIN_EMAILS', 'WECHAT_OAUTH_ENABLED', 'WECHAT_MASS_SEND_ENABLED']) delete process.env[key];
    jest.restoreAllMocks();
  });
  async function admin() {
    const res = await request(app).post('/api/auth/register').send({ email: 'admin@example.com', password: 'password123' });
    return `Bearer ${res.body.data.token}`;
  }
  function articles() {
    const db = getDb();
    db.prepare('INSERT INTO sources (name, rssUrl) VALUES (?, ?)').run('Source', 'https://example.com/rss');
    for (let i = 1; i <= 2; i++) {
      db.prepare('INSERT INTO articles (title, summary, originalUrl, sourceId) VALUES (?, ?, ?, ?)')
        .run(`新闻 ${i}`, `摘要 ${i}`, `https://example.com/${i}`, 1);
    }
    setWechatSettings({ accessToken: 'cached-token', tokenExpiresAt: new Date(Date.now() + 3600000).toISOString() });
  }
  async function start(returnTo = '/push/0123456789abcdef0123456789abcdef') {
    const res = await request(app).get('/news/api/wechat/auth/start').query({ returnTo });
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.origin).toBe('https://open.weixin.qq.com');
    expect(url.searchParams.get('scope')).toBe('snsapi_base');
    expect(url.searchParams.get('redirect_uri')).toBe('https://news.example.com/news/api/wechat/auth/callback');
    expect(res.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(res.headers['set-cookie'][0]).toContain('Secure');
    return { state: url.searchParams.get('state'), cookie: res.headers['set-cookie'][0].split(';')[0] };
  }
  it('authenticates via browser-bound, single-use state and ticket, and reuses the account', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ openid: 'wx-user-1', access_token: 'private-oauth-token' }) });
    const flow = await start();
    const callback = await request(app).get('/news/api/wechat/auth/callback').query({ state: flow.state, code: 'code-1' }).set('Cookie', flow.cookie);
    expect(callback.status).toBe(302);
    expect(callback.headers.location).not.toContain('private-oauth-token');
    const ticket = new URLSearchParams(new URL(callback.headers.location).hash.slice(1)).get('ticket');
    const wrongBrowser = await request(app).post('/api/wechat/auth/exchange').send({ ticket });
    expect(wrongBrowser.status).toBe(400);
    const login = await request(app).post('/news/api/wechat/auth/exchange').set('Cookie', flow.cookie).send({ ticket });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('user');
    expect(login.body.data.returnTo).toBe('/push/0123456789abcdef0123456789abcdef');
    const userId = login.body.data.user.id;
    expect(findOrCreateWechatUser('wx123', 'wx-user-1').id).toBe(userId);
    expect(findOrCreateWechatUser('other-app', 'wx-user-1').id).not.toBe(userId);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.data.token}`);
    expect(me.body.data.user.displayName).toBe('微信用户');
    expect((await request(app).post('/api/wechat/auth/exchange').set('Cookie', flow.cookie).send({ ticket })).status).toBe(400);
    expect((await request(app).get('/api/wechat/auth/callback').set('Cookie', flow.cookie).query({ state: flow.state, code: 'code-1' })).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects wrong-browser and expired authorization without calling WeChat', async () => {
    const flow = await start('https://evil.example');
    expect(getDb().prepare('SELECT returnTo FROM wechat_oauth_flows').get().returnTo).toBe('/');
    expect((await request(app).get('/api/wechat/auth/callback').query({ state: flow.state, code: 'x' }).set('Cookie', 'news-wx-browser=wrong')).status).toBe(400);
    getDb().prepare('UPDATE wechat_oauth_flows SET expiresAt = 0').run();
    expect((await request(app).get('/api/wechat/auth/callback').query({ state: flow.state, code: 'x' }).set('Cookie', flow.cookie)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps OAuth unavailable until configured and rejects upstream failures', async () => {
    delete process.env.PUBLIC_BASE_URL;
    const status = await request(app).get('/api/wechat/auth/status');
    expect(status.body.data.enabled).toBe(false);
    expect((await request(app).get('/api/wechat/auth/start')).status).toBe(503);
    process.env.PUBLIC_BASE_URL = 'https://news.example.com/news';
    const flow = await start();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ errcode: 40029, errmsg: 'invalid code' }) });
    expect((await request(app).get('/api/wechat/auth/callback').set('Cookie', flow.cookie).query({ state: flow.state, code: 'bad' })).status).toBe(502);
    expect(getDb().prepare('SELECT count(*) AS count FROM wechat_users').get().count).toBe(0);
  });
  it('restricts all management operations and never returns secrets', async () => {
    const user = findOrCreateWechatUser('wx123', 'ordinary');
    const userToken = `Bearer ${generateToken({ userId: user.id })}`;
    for (const prefix of ['/api/wechat', '/news/api/wechat']) {
      for (const [method, path] of [['get', '/settings'], ['put', '/settings'], ['post', '/flag'], ['get', '/flags'], ['get', '/preview-content'], ['post', '/preview'], ['get', '/logs'], ['get', '/browser-login'], ['post', '/browser-login'], ['post', '/pushes'], ['post', '/pushes/id/send'], ['get', '/pushes/id/publication'], ['post', '/pushes/id/publication']]) {
        expect((await request(app)[method](prefix + path)).status).toBe(401);
        expect((await request(app)[method](prefix + path).set('Authorization', userToken)).status).toBe(403);
      }
    }
    const auth = await admin();
    const login = await request(app).get('/api/wechat/browser-login').set('Authorization', auth);
    expect(login.headers['cache-control']).toBe('no-store');
    expect(login.body.data).toEqual({ status: 'idle' });
    const settings = await request(app).get('/api/wechat/settings').set('Authorization', auth);
    expect(settings.body.data.appSecretConfigured).toBe(true);
    for (const key of ['appSecret', 'accessToken', 'tokenExpiresAt']) expect(settings.body.data[key]).toBeUndefined();
    const invalid = await request(app).put('/api/wechat/settings').set('Authorization', auth).send({ summaryPushCron: 'invalid' });
    expect(invalid.status).toBe(400);
  });
  it('preserves an uncertain browser publication without relaunching or resubmitting it', async () => {
    const auth = await admin();
    const draft = createPush([{ id: 1, title: '新闻' }]);
    const endpoint = `/api/wechat/pushes/${draft.id}/publication`;
    const idle = await request(app).get(endpoint).set('Authorization', auth);
    expect(idle.body.data.status).toBe('idle');
    getDb().prepare("INSERT INTO wechat_publications (pushId, status) VALUES (?, 'unknown')").run(draft.id);
    const result = await request(app).post(endpoint).set('Authorization', auth);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.data).toEqual({ status: 'unknown' });
  });
  it('creates fixed single and multi-article lists, previews and sends the exact reviewed text once', async () => {
    articles();
    const auth = await admin();
    const single = await request(app).post('/api/wechat/pushes').set('Authorization', auth).send({ articleIds: [1] });
    expect(single.body.data.totalCount).toBe(1);
    const draft = await request(app).post('/news/api/wechat/pushes').set('Authorization', auth).send({ articleIds: [2, 1] });
    expect(draft.status).toBe(200);
    const { id, text } = draft.body.data;
    getDb().prepare('UPDATE articles SET title = ? WHERE id = 2').run('Changed');
    const saved = await request(app).get(`/api/wechat/pushes/${id}`);
    expect(saved.body.data.articles[0].title).toBe('新闻 2');
    expect((await request(app).post(`/api/wechat/pushes/${id}/send`).set('Authorization', auth).send({})).status).toBe(400);
    const preview = await request(app).post(`/api/wechat/pushes/${id}/send`).set('Authorization', auth).send({ preview: true });
    expect(preview.status).toBe(200);
    const previewBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(previewBody).toEqual({ touser: 'preview-openid', msgtype: 'text', text: { content: text } });
    const send = () => request(app).post(`/api/wechat/pushes/${id}/send`).set('Authorization', auth).send({ confirm: true });
    expect((await send()).status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ filter: { is_to_all: true }, msgtype: 'text', text: { content: text } });
    expect((await send()).status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const logs = await request(app).get('/api/wechat/logs').set('Authorization', auth);
    expect(logs.body.data.logs).toHaveLength(2);
  });
  it('records ambiguous failures and prevents an automatic resend', async () => {
    articles();
    const auth = await admin();
    const draft = await request(app).post('/api/wechat/pushes').set('Authorization', auth).send({ articleIds: [1] });
    fetchMock.mockRejectedValue(new Error('timeout'));
    const send = () => request(app).post(`/api/wechat/pushes/${draft.body.data.id}/send`).set('Authorization', auth).send({ confirm: true });
    expect((await send()).status).toBe(500);
    expect((await send()).status).toBe(409);
    expect(getDb().prepare('SELECT status FROM news_pushes').get().status).toBe('unknown');
    expect(getDb().prepare('SELECT status FROM wechat_push_logs').get().status).toBe('failed');
  });
  it('validates article selection and includes today’s SQLite timestamped news', async () => {
    articles();
    const auth = await admin();
    for (const articleIds of [[], ['1'], [-1], Array(101).fill(1)]) {
      expect((await request(app).post('/api/wechat/pushes').set('Authorization', auth).send({ articleIds })).status).toBe(400);
    }
    expect((await request(app).post('/api/wechat/pushes').set('Authorization', auth).send({ articleIds: [999] })).status).toBe(404);
    expect(getRecentArticles()).toHaveLength(2);
    const push = createPush(Array.from({ length: 100 }, (_, id) => ({ id, title: '新闻'.repeat(100), summary: '' })));
    expect(Buffer.byteLength(push.text, 'utf8')).toBeLessThanOrEqual(2048);
    expect((await pushSummary([])).status).toBe('skipped');
  });

  it('supports manual publication on HTTP without credentials and blocks disabled WeChat capabilities', async () => {
    delete process.env.WECHAT_OAUTH_ENABLED;
    delete process.env.WECHAT_MASS_SEND_ENABLED;
    process.env.PUBLIC_BASE_URL = 'http://q7banlife.me/news';
    articles();
    getDb().prepare('DELETE FROM wechat_settings').run();
    const auth = await admin();
    const settings = await request(app).get('/api/wechat/settings').set('Authorization', auth);
    expect(settings.body.data.entryUrl).toBe('http://q7banlife.me/news');
    expect(settings.body.data.oauthEnabled).toBe(false);
    expect(settings.body.data.massSendEnabled).toBe(false);
    expect((await request(app).get('/api/wechat/auth/status')).body.data.enabled).toBe(false);
    expect((await request(app).get('/api/wechat/auth/start')).status).toBe(403);
    const draft = await request(app).post('/api/wechat/pushes').set('Authorization', auth).send({ articleIds: [1, 2] });
    expect(draft.status).toBe(200);
    expect(draft.body.data.url).toMatch(/^http:\/\/q7banlife.me\/news\/push\//);
    expect((await request(app).get(`/api/wechat/pushes/${draft.body.data.id}`)).status).toBe(200);
    for (const body of [{ preview: true }, { confirm: true }]) {
      expect((await request(app).post(`/api/wechat/pushes/${draft.body.data.id}/send`).set('Authorization', auth).send(body)).status).toBe(403);
    }
    expect((await request(app).put('/api/wechat/settings').set('Authorization', auth).send({ summaryPushEnabled: true })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    process.env.WECHAT_OAUTH_ENABLED = 'true';
    setWechatSettings({ appId: 'wx123', appSecret: 'secret' });
    expect((await request(app).get('/api/wechat/auth/status')).body.data.enabled).toBe(false);
    expect((await request(app).get('/api/wechat/auth/start')).status).toBe(503);
  });
});
