import { jest } from '@jest/globals';

import { getDb, closeDb, initSchema } from '../src/db.js';
import { flagArticle, unflagArticle, isFlagged, listFlaggedArticleIds } from '../src/models/articleFlag.js';
import { getWechatSettings, setWechatSettings } from '../src/models/wechatSettings.js';

describe('WechatSettings', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('returns default settings when empty', () => {
    const settings = getWechatSettings();
    expect(settings).toBeNull();
  });

  it('saves and retrieves settings', () => {
    setWechatSettings({ appId: 'wx123', appSecret: 'secret456', previewOpenId: 'openid789' });
    const settings = getWechatSettings();
    expect(settings.appId).toBe('wx123');
    expect(settings.appSecret).toBe('secret456');
    expect(settings.previewOpenId).toBe('openid789');
    expect(settings.summaryPushEnabled).toBe(1);
    expect(settings.summaryPushCron).toBe('0 8 * * *');
  });
});

describe('ArticleFlag', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
    db.prepare('INSERT INTO sources (name, rssUrl, category, isActive) VALUES (?, ?, ?, ?)').run('Test Source', 'http://example.com/rss', 'tech', 1);
    db.prepare('INSERT INTO articles (title, originalUrl, sourceId, publishedAt) VALUES (?, ?, ?, ?)').run('Test Article', 'http://example.com/1', 1, new Date().toISOString());
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('flags and unflags an article', () => {
    expect(isFlagged(1)).toBe(false);
    flagArticle(1);
    expect(isFlagged(1)).toBe(true);
    unflagArticle(1);
    expect(isFlagged(1)).toBe(false);
  });

  it('lists flagged article ids', () => {
    flagArticle(1);
    const ids = listFlaggedArticleIds();
    expect(ids).toEqual([1]);
  });
});

import { logPush, listPushLogs } from '../src/models/wechatPushLog.js';

describe('WechatPushLog', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('logs a push and lists logs', () => {
    logPush({ articleId: 1, pushType: 'preview', status: 'success', wxMessageId: 'msg123' });
    const logs = listPushLogs({ limit: 10 });
    expect(logs.length).toBe(1);
    expect(logs[0].pushType).toBe('preview');
    expect(logs[0].status).toBe('success');
  });
});
describe('WechatService', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
    setWechatSettings({ appId: 'test_appid', appSecret: 'test_secret', previewOpenId: 'test_openid' });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new_token', expires_in: 7200 })
    });
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
    jest.restoreAllMocks();
  });

  it('fetchAccessToken returns token from cache if valid', async () => {
    const { fetchAccessToken } = await import('../src/services/wechat.js');
    const db = getDb();
    db.prepare("UPDATE wechat_settings SET accessToken = ?, tokenExpiresAt = ? WHERE id = 1")
      .run('cached_token', new Date(Date.now() + 60 * 60 * 1000).toISOString());
    const token = await fetchAccessToken();
    expect(token).toBe('cached_token');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

import request from 'supertest';
import { app } from '../src/app.js';

describe('Wechat Routes', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('GET /api/wechat/settings returns settings', async () => {
    const res = await request(app).get('/api/wechat/settings');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toBeNull();
  });

  it('PUT /api/wechat/settings saves settings', async () => {
    const res = await request(app).put('/api/wechat/settings').send({
      appId: 'wx_test',
      appSecret: 'secret_test',
      previewOpenId: 'openid_test'
    });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.appId).toBe('wx_test');
  });
});


import { startSummaryPushScheduler, stopSummaryPushScheduler } from '../src/services/scheduler.js';

describe('SummaryPushScheduler', () => {
  it('starts and stops without error', () => {
    expect(() => startSummaryPushScheduler()).not.toThrow();
    expect(() => stopSummaryPushScheduler()).not.toThrow();
  });
});

