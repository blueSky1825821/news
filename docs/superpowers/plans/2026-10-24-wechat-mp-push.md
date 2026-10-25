# 微信公众号推送功能实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为新闻头条播报系统增加微信公众号推送能力（定时汇总 + 用户标记重要 + 手动预览推送）。

**架构：** 后端新增微信 API 封装层、配置/日志/标记模型、定时推送任务；前端新增标记按钮和公众号配置页面。使用订阅号群发接口实现定时汇总，预览接口实现单篇推送。

**技术栈：** Node.js + Express + node:sqlite + node-cron + React + Vite

---

## 文件清单

| 文件 | 职责 |
|------|------|
| `backend/src/db.js` | 新增 `wechat_settings`、`wechat_push_logs`、`article_flags` 表初始化 |
| `backend/src/models/wechatSettings.js` | 公众号配置读写（单记录，id=1） |
| `backend/src/models/wechatPushLog.js` | 推送记录写入/查询 |
| `backend/src/models/articleFlag.js` | 用户标记重要文章（插入/删除/查询） |
| `backend/src/services/wechat.js` | 微信 API 封装：access_token 获取与缓存、群发接口、预览接口 |
| `backend/src/routes/wechat.js` | RESTful 路由：配置 CRUD、标记重要、手动预览 |
| `backend/src/services/scheduler.js` | 新增定时推送任务（早 8:00） |
| `backend/src/app.js` | 注册 `/api/wechat` 路由 |
| `frontend/src/services/api.js` | 新增 wechat 相关 API 调用 |
| `frontend/src/components/NewsCard.jsx` | 增加"标记重要"星形按钮 |
| `frontend/src/components/NewsDetail.jsx` | 增加"标记重要"星形按钮和"预览推送"按钮 |
| `frontend/src/components/WechatSettings.jsx` | 公众号配置页面（AppID/AppSecret/预览OpenID/开关/Cron） |
| `frontend/src/App.jsx` | 新增 `/wechat-settings` 路由 |
| `backend/tests/wechat.test.js` | 微信 service 和路由的单元/集成测试 |

---

## 任务 1：数据库表初始化

**文件：**
- 修改：`backend/src/db.js`
- 测试：`backend/tests/db.test.js`

- [ ] **步骤 1：编写失败的测试**

在 `backend/tests/db.test.js` 中新增测试：

```javascript
  it('initializes wechat-related tables', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('wechat_settings', 'wechat_push_logs', 'article_flags')"
    ).all();
    expect(tables.length).toBe(3);
  });
```

- [ ] **步骤 2：运行测试验证失败**

```bash
cd f:\program\ai\news\backend; npm test -- tests/db.test.js
```

预期：FAIL，tables.length 为 0

- [ ] **步骤 3：修改 db.js 添加表初始化**

在 `backend/src/db.js` 的 `initSchema` 函数中，在现有表定义之后追加：

```javascript
    CREATE TABLE IF NOT EXISTS wechat_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      appId TEXT,
      appSecret TEXT,
      accessToken TEXT,
      tokenExpiresAt DATETIME,
      previewOpenId TEXT,
      summaryPushEnabled BOOLEAN NOT NULL DEFAULT 1,
      summaryPushCron TEXT NOT NULL DEFAULT '0 8 * * *',
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wechat_push_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      articleId INTEGER,
      pushType TEXT NOT NULL,
      status TEXT NOT NULL,
      wxMessageId TEXT,
      errorMessage TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS article_flags (
      articleId INTEGER PRIMARY KEY,
      flaggedBy TEXT NOT NULL DEFAULT 'system',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (articleId) REFERENCES articles(id) ON DELETE CASCADE
    );
```

- [ ] **步骤 4：运行测试验证通过**

```bash
cd f:\program\ai\news\backend; npm test -- tests/db.test.js
```

预期：PASS

- [ ] **步骤 5：Commit**

```bash
cd f:\program\ai\news; git add backend/src/db.js backend/tests/db.test.js
git commit -m "feat(db): add wechat_settings, wechat_push_logs, article_flags tables"
```

---

## 任务 2：微信配置模型

**文件：**
- 创建：`backend/src/models/wechatSettings.js`
- 测试：`backend/tests/wechat.test.js`

- [ ] **步骤 1：编写失败的测试**

创建 `backend/tests/wechat.test.js`：

```javascript
import { getDb, closeDb, initSchema } from '../src/db.js';
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
```

- [ ] **步骤 2：运行测试验证失败**

```bash
cd f:\program\ai\news\backend; npm test -- tests/wechat.test.js
```

预期：FAIL，模块未找到

- [ ] **步骤 3：实现 wechatSettings.js**

创建 `backend/src/models/wechatSettings.js`：

```javascript
import { getDb } from '../db.js';

export function getWechatSettings() {
  const db = getDb();
  return db.prepare('SELECT * FROM wechat_settings WHERE id = 1').get() || null;
}

export function setWechatSettings({ appId, appSecret, accessToken, tokenExpiresAt, previewOpenId, summaryPushEnabled, summaryPushCron }) {
  const db = getDb();
  const existing = getWechatSettings();
  if (existing) {
    const stmt = db.prepare(`
      UPDATE wechat_settings SET
        appId = COALESCE(?, appId),
        appSecret = COALESCE(?, appSecret),
        accessToken = COALESCE(?, accessToken),
        tokenExpiresAt = COALESCE(?, tokenExpiresAt),
        previewOpenId = COALESCE(?, previewOpenId),
        summaryPushEnabled = COALESCE(?, summaryPushEnabled),
        summaryPushCron = COALESCE(?, summaryPushCron),
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = 1
    `);
    stmt.run(appId, appSecret, accessToken, tokenExpiresAt, previewOpenId, summaryPushEnabled, summaryPushCron);
  } else {
    const stmt = db.prepare(`
      INSERT INTO wechat_settings (id, appId, appSecret, accessToken, tokenExpiresAt, previewOpenId, summaryPushEnabled, summaryPushCron)
      VALUES (1, ?, ?, ?, ?, ?, COALESCE(?, 1), COALESCE(?, '0 8 * * *'))
    `);
    stmt.run(appId, appSecret, accessToken, tokenExpiresAt, previewOpenId, summaryPushEnabled, summaryPushCron);
  }
  return getWechatSettings();
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
cd f:\program\ai\news\backend; npm test -- tests/wechat.test.js
```

预期：PASS

- [ ] **步骤 5：Commit**

```bash
cd f:\program\ai\news; git add backend/src/models/wechatSettings.js backend/tests/wechat.test.js
git commit -m "feat(model): add wechatSettings CRUD"
```

---

## 任务 3：文章标记模型

**文件：**
- 创建：`backend/src/models/articleFlag.js`
- 测试：`backend/tests/wechat.test.js`

- [ ] **步骤 1：编写失败的测试**

在 `backend/tests/wechat.test.js` 中追加：

```javascript
import { flagArticle, unflagArticle, isFlagged, listFlaggedArticleIds } from '../src/models/articleFlag.js';

describe('ArticleFlag', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
    // Seed an article for foreign key
    db.prepare('INSERT INTO articles (title, originalUrl, sourceId, publishedAt) VALUES (?, ?, ?, ?)')
      .run('Test Article', 'http://example.com/1', 1, new Date().toISOString());
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
```

- [ ] **步骤 2：运行测试验证失败**

```bash
cd f:\program\ai\news\backend; npm test -- tests/wechat.test.js
```

预期：FAIL

- [ ] **步骤 3：实现 articleFlag.js**

创建 `backend/src/models/articleFlag.js`：

```javascript
import { getDb } from '../db.js';

export function flagArticle(articleId, flaggedBy = 'system') {
  const db = getDb();
  const stmt = db.prepare('INSERT OR IGNORE INTO article_flags (articleId, flaggedBy) VALUES (?, ?)');
  stmt.run(articleId, flaggedBy);
}

export function unflagArticle(articleId) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM article_flags WHERE articleId = ?');
  stmt.run(articleId);
}

export function isFlagged(articleId) {
  const db = getDb();
  const stmt = db.prepare('SELECT 1 FROM article_flags WHERE articleId = ?');
  return !!stmt.get(articleId);
}

export function listFlaggedArticleIds() {
  const db = getDb();
  const stmt = db.prepare('SELECT articleId FROM article_flags ORDER BY createdAt DESC');
  return stmt.all().map((r) => r.articleId);
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
cd f:\program\ai\news\backend; npm test -- tests/wechat.test.js
```

预期：PASS

- [ ] **步骤 5：Commit**

```bash
cd f:\program\ai\news; git add backend/src/models/articleFlag.js backend/tests/wechat.test.js
git commit -m "feat(model): add articleFlag for marking important articles"
```

---

## 任务 4：推送日志模型

**文件：**
- 创建：`backend/src/models/wechatPushLog.js`
- 测试：`backend/tests/wechat.test.js`

- [ ] **步骤 1：编写失败的测试**

在 `backend/tests/wechat.test.js` 中追加：

```javascript
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
```

- [ ] **步骤 2：运行测试验证失败**

```bash
cd f:\program\ai\news\backend; npm test -- tests/wechat.test.js
```

预期：FAIL

- [ ] **步骤 3：实现 wechatPushLog.js**

创建 `backend/src/models/wechatPushLog.js`：

```javascript
import { getDb } from '../db.js';

export function logPush({ articleId = null, pushType, status, wxMessageId = null, errorMessage = null }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO wechat_push_logs (articleId, pushType, status, wxMessageId, errorMessage)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(articleId, pushType, status, wxMessageId, errorMessage);
}

export function listPushLogs({ limit = 50 } = {}) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM wechat_push_logs ORDER BY createdAt DESC LIMIT ?
  `);
  return stmt.all(limit);
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
cd f:\program\ai\news\backend; npm test -- tests/wechat.test.js
```

预期：PASS

- [ ] **步骤 5：Commit**

```bash
cd f:\program\ai\news; git add backend/src/models/wechatPushLog.js backend/tests/wechat.test.js
git commit -m "feat(model): add wechatPushLog for tracking push history"
```

---

## 任务 5：微信 API 服务封装

**文件：**
- 创建：`backend/src/services/wechat.js`
- 测试：`backend/tests/wechat.test.js`

- [ ] **步骤 1：编写失败的测试**

在 `backend/tests/wechat.test.js` 中追加：

```javascript
import { jest } from '@jest/globals';
import { getDb, closeDb, initSchema } from '../src/db.js';
import { setWechatSettings } from '../src/models/wechatSettings.js';

jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn()
}));

const { fetchAccessToken, pushPreview } = await import('../src/services/wechat.js');

describe('WechatService', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
    setWechatSettings({ appId: 'test_appid', appSecret: 'test_secret', previewOpenId: 'test_openid' });
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('fetchAccessToken returns token from cache if valid', async () => {
    const db = getDb();
    db.prepare("UPDATE wechat_settings SET accessToken = ?, tokenExpiresAt = datetime('now', '+1 hour') WHERE id = 1")
      .run('cached_token');
    const token = await fetchAccessToken();
    expect(token).toBe('cached_token');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
cd f:\program\ai\news\backend; npm test -- tests/wechat.test.js
```

预期：FAIL

- [ ] **步骤 3：实现 wechat.js service**

创建 `backend/src/services/wechat.js`：

```javascript
import { getWechatSettings, setWechatSettings } from '../models/wechatSettings.js';
import { logPush } from '../models/wechatPushLog.js';

const WECHAT_API_BASE = 'https://api.weixin.qq.com/cgi-bin';

export async function fetchAccessToken() {
  const settings = getWechatSettings();
  if (!settings || !settings.appId || !settings.appSecret) {
    throw new Error('WeChat appId or appSecret not configured');
  }

  // Check cache
  if (settings.accessToken && settings.tokenExpiresAt) {
    const expiresAt = new Date(settings.tokenExpiresAt).getTime();
    if (Date.now() < expiresAt - 5 * 60 * 1000) { // 5 min buffer
      return settings.accessToken;
    }
  }

  // Fetch new token
  const url = `${WECHAT_API_BASE}/token?grant_type=client_credential&appid=${encodeURIComponent(settings.appId)}&secret=${encodeURIComponent(settings.appSecret)}`;
  const res = await fetch(url, { timeout: 10000 });
  const data = await res.json();

  if (data.errcode) {
    throw new Error(`WeChat API error: ${data.errcode} ${data.errmsg}`);
  }

  const accessToken = data.access_token;
  const expiresIn = data.expires_in || 7200;
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  setWechatSettings({ accessToken, tokenExpiresAt });
  return accessToken;
}

export async function pushSummary(articles, flaggedIds = []) {
  const token = await fetchAccessToken();

  if (!articles || articles.length === 0) {
    return { status: 'skipped', reason: 'No articles to push' };
  }

  // Sort flagged articles first
  const sorted = [...articles].sort((a, b) => {
    const aFlagged = flaggedIds.includes(a.id) ? 1 : 0;
    const bFlagged = flaggedIds.includes(b.id) ? 1 : 0;
    return bFlagged - aFlagged;
  });

  const dateStr = new Date().toLocaleDateString('zh-CN');
  const title = `📰 每日新闻播报 | ${dateStr}（共 ${sorted.length} 篇）`;

  // Build content as text list with links
  const contentLines = sorted.map((article, idx) => {
    const flag = flaggedIds.includes(article.id) ? '🔥 ' : '';
    return `${idx + 1}. ${flag}${article.title}`;
  });
  const content = contentLines.join('\n');

  const message = {
    filter: { is_to_all: true },
    mpnews: {
      articles: [
        {
          title,
          thumb_media_id: '', // We skip image for simplicity
          author: '新闻播报',
          content: content.replace(/\n/g, '<br>'),
          content_source_url: '',
          digest: contentLines.slice(0, 3).join('\n'),
          show_cover_pic: 0
        }
      ]
    },
    msgtype: 'mpnews'
  };

  const url = `${WECHAT_API_BASE}/message/mass/sendall?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });
  const data = await res.json();

  if (data.errcode && data.errcode !== 0) {
    logPush({ pushType: 'summary', status: 'failed', errorMessage: `${data.errcode}: ${data.errmsg}` });
    throw new Error(`WeChat mass send failed: ${data.errcode} ${data.errmsg}`);
  }

  logPush({ pushType: 'summary', status: 'success', wxMessageId: String(data.msg_id) });
  return { status: 'success', msgId: data.msg_id };
}

export async function pushPreview(article) {
  const settings = getWechatSettings();
  if (!settings || !settings.previewOpenId) {
    throw new Error('Preview OpenID not configured');
  }

  const token = await fetchAccessToken();

  const message = {
    touser: settings.previewOpenId,
    mpnews: {
      articles: [
        {
          title: article.title,
          thumb_media_id: '',
          author: article.sourceName || '新闻播报',
          content: (article.summary || article.content || '').slice(0, 500).replace(/\n/g, '<br>'),
          content_source_url: article.originalUrl || '',
          digest: (article.summary || '').slice(0, 120),
          show_cover_pic: 0
        }
      ]
    },
    msgtype: 'mpnews'
  };

  const url = `${WECHAT_API_BASE}/message/mass/preview?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });
  const data = await res.json();

  if (data.errcode && data.errcode !== 0) {
    logPush({ articleId: article.id, pushType: 'preview', status: 'failed', errorMessage: `${data.errcode}: ${data.errmsg}` });
    throw new Error(`WeChat preview failed: ${data.errcode} ${data.errmsg}`);
  }

  logPush({ articleId: article.id, pushType: 'preview', status: 'success', wxMessageId: String(data.msg_id) });
  return { status: 'success', msgId: data.msg_id };
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
cd f:\program\ai\news\backend; npm test -- tests/wechat.test.js
```

预期：PASS（至少缓存 token 的测试通过；网络测试需要 mock）

- [ ] **步骤 5：Commit**

```bash
cd f:\program\ai\news; git add backend/src/services/wechat.js backend/tests/wechat.test.js
git commit -m "feat(service): add wechat API wrapper with access_token cache"
```

---

## 任务 6：微信路由

**文件：**
- 创建：`backend/src/routes/wechat.js`
- 修改：`backend/src/app.js`
- 测试：`backend/tests/wechat.test.js`

- [ ] **步骤 1：编写失败的测试**

在 `backend/tests/wechat.test.js` 中追加路由测试：

```javascript
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
```

- [ ] **步骤 2：运行测试验证失败**

```bash
cd f:\program\ai\news\backend; npm test -- tests/wechat.test.js
```

预期：FAIL，404（路由未注册）

- [ ] **步骤 3：实现 wechat.js 路由**

创建 `backend/src/routes/wechat.js`：

```javascript
import { Router } from 'express';
import { getWechatSettings, setWechatSettings } from '../models/wechatSettings.js';
import { flagArticle, unflagArticle, isFlagged, listFlaggedArticleIds } from '../models/articleFlag.js';
import { getArticleById } from '../models/article.js';
import { pushPreview } from '../services/wechat.js';

const router = Router();

router.get('/settings', (req, res, next) => {
  try {
    const settings = getWechatSettings();
    res.sendJson(0, 'success', settings);
  } catch (err) {
    next(err);
  }
});

router.put('/settings', (req, res, next) => {
  try {
    const { appId, appSecret, previewOpenId, summaryPushEnabled, summaryPushCron } = req.body;
    const settings = setWechatSettings({ appId, appSecret, previewOpenId, summaryPushEnabled, summaryPushCron });
    res.sendJson(0, 'Settings saved', settings);
  } catch (err) {
    next(err);
  }
});

router.post('/flag', (req, res, next) => {
  try {
    const { articleId } = req.body;
    const id = Number(articleId);
    if (!Number.isFinite(id) || id <= 0) {
      const err = new Error('Invalid article id');
      err.statusCode = 400;
      err.code = 1002;
      throw err;
    }
    if (isFlagged(id)) {
      unflagArticle(id);
      res.sendJson(0, 'Unflagged', { articleId: id, flagged: false });
    } else {
      flagArticle(id);
      res.sendJson(0, 'Flagged', { articleId: id, flagged: true });
    }
  } catch (err) {
    next(err);
  }
});

router.get('/flags', (req, res, next) => {
  try {
    const ids = listFlaggedArticleIds();
    res.sendJson(0, 'success', { articleIds: ids });
  } catch (err) {
    next(err);
  }
});

router.post('/preview', async (req, res, next) => {
  try {
    const { articleId } = req.body;
    const id = Number(articleId);
    if (!Number.isFinite(id) || id <= 0) {
      const err = new Error('Invalid article id');
      err.statusCode = 400;
      err.code = 1002;
      throw err;
    }

    const article = getArticleById(id);
    if (!article) {
      const err = new Error('Article not found');
      err.statusCode = 404;
      err.code = 1003;
      throw err;
    }

    const result = await pushPreview(article);
    res.sendJson(0, 'Preview sent', result);
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **步骤 4：注册路由到 app.js**

在 `backend/src/app.js` 中添加：

```javascript
import wechatRouter from './routes/wechat.js';
```

并在路由注册区域添加：

```javascript
app.use('/api/wechat', wechatRouter);
```

- [ ] **步骤 5：运行测试验证通过**

```bash
cd f:\program\ai\news\backend; npm test -- tests/wechat.test.js
```

预期：PASS

- [ ] **步骤 6：Commit**

```bash
cd f:\program\ai\news; git add backend/src/routes/wechat.js backend/src/app.js backend/tests/wechat.test.js
git commit -m "feat(routes): add wechat settings, flag, and preview endpoints"
```

---

## 任务 7：定时推送任务

**文件：**
- 修改：`backend/src/services/scheduler.js`
- 修改：`backend/src/server.js`
- 测试：`backend/tests/wechat.test.js`

- [ ] **步骤 1：编写失败的测试**

在 `backend/tests/wechat.test.js` 中追加：

```javascript
import { startSummaryPushScheduler, stopSummaryPushScheduler } from '../src/services/scheduler.js';

describe('SummaryPushScheduler', () => {
  it('starts and stops without error', () => {
    expect(() => startSummaryPushScheduler()).not.toThrow();
    expect(() => stopSummaryPushScheduler()).not.toThrow();
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
cd f:\program\ai\news\backend; npm test -- tests/wechat.test.js
```

预期：FAIL，函数未导出

- [ ] **步骤 3：修改 scheduler.js 添加定时推送**

在 `backend/src/services/scheduler.js` 中，在现有导入后追加：

```javascript
import { getWechatSettings } from '../models/wechatSettings.js';
import { listFlaggedArticleIds } from '../models/articleFlag.js';
import { pushSummary } from './wechat.js';
import { getDb } from '../db.js';
```

在文件末尾追加：

```javascript
let summaryTask = null;

export function startSummaryPushScheduler() {
  if (summaryTask) return;
  const settings = getWechatSettings();
  const cronExpression = settings?.summaryPushCron || '0 8 * * *';

  summaryTask = cron.schedule(cronExpression, async () => {
    try {
      const settings = getWechatSettings();
      if (!settings || !settings.summaryPushEnabled) {
        console.log('[WechatPush] Summary push disabled, skipping.');
        return;
      }
      if (!settings.appId || !settings.appSecret) {
        console.log('[WechatPush] WeChat not configured, skipping.');
        return;
      }

      const db = getDb();
      const articles = db.prepare(`
        SELECT id, title, summary, originalUrl, sourceId, publishedAt
        FROM articles
        WHERE fetchedAt >= datetime('now', '-1 day')
        ORDER BY publishedAt DESC
      `).all();

      const flaggedIds = listFlaggedArticleIds();
      const result = await pushSummary(articles, flaggedIds);
      console.log('[WechatPush] Summary push result:', result.status);
    } catch (err) {
      console.error('[WechatPush] Summary push failed:', err.message);
    }
  }, {
    timezone: 'Asia/Shanghai'
  });

  console.log('[Scheduler] Summary push scheduled with cron:', cronExpression);
}

export function stopSummaryPushScheduler() {
  if (summaryTask) {
    summaryTask.stop();
    summaryTask = null;
    console.log('[Scheduler] Summary push stopped.');
  }
}
```

- [ ] **步骤 4：修改 server.js 启动定时推送**

在 `backend/src/server.js` 中，在 `startScheduler()` 之后添加：

```javascript
import { startSummaryPushScheduler } from './services/scheduler.js';
```

并在 `startScheduler()` 调用之后添加：

```javascript
startSummaryPushScheduler();
```

- [ ] **步骤 5：运行测试验证通过**

```bash
cd f:\program\ai\news\backend; npm test -- tests/wechat.test.js
```

预期：PASS

- [ ] **步骤 6：Commit**

```bash
cd f:\program\ai\news; git add backend/src/services/scheduler.js backend/src/server.js backend/tests/wechat.test.js
git commit -m "feat(scheduler): add daily summary push to WeChat Official Account"
```

---

## 任务 8：前端 API 服务

**文件：**
- 修改：`frontend/src/services/api.js`

- [ ] **步骤 1：修改 api.js**

在 `frontend/src/services/api.js` 的 `api` 对象中追加：

```javascript
  // WeChat
  getWechatSettings() {
    return request('/api/wechat/settings');
  },

  setWechatSettings(settings) {
    return request('/api/wechat/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },

  toggleFlagArticle(articleId) {
    return request('/api/wechat/flag', {
      method: 'POST',
      body: JSON.stringify({ articleId })
    });
  },

  getFlaggedArticleIds() {
    return request('/api/wechat/flags');
  },

  sendPreview(articleId) {
    return request('/api/wechat/preview', {
      method: 'POST',
      body: JSON.stringify({ articleId })
    });
  }
```

- [ ] **步骤 2：运行前端构建验证**

```bash
cd f:\program\ai\news\frontend; npm run build
```

预期：构建成功

- [ ] **步骤 3：Commit**

```bash
cd f:\program\ai\news; git add frontend/src/services/api.js
git commit -m "feat(api): add wechat settings, flag, and preview client APIs"
```

---

## 任务 9：NewsCard 和 NewsDetail 增加标记按钮

**文件：**
- 修改：`frontend/src/components/NewsCard.jsx`
- 修改：`frontend/src/components/NewsDetail.jsx`

- [ ] **步骤 1：修改 NewsCard.jsx**

在 `NewsCard` 组件中增加状态和按钮。找到合适的位置（标题旁边）添加星形按钮：

```jsx
import { useState, useEffect } from 'react';
import { api } from '../services/api.js';

// 在组件内部添加：
const [isFlagged, setIsFlagged] = useState(false);

useEffect(() => {
  api.getFlaggedArticleIds().then((data) => {
    setIsFlagged(data.articleIds?.includes(article.id) || false);
  }).catch(() => {});
}, [article.id]);

const handleToggleFlag = async (e) => {
  e.preventDefault();
  e.stopPropagation();
  try {
    const result = await api.toggleFlagArticle(article.id);
    setIsFlagged(result.flagged);
  } catch (err) {
    console.error('标记失败:', err);
  }
};

// 在标题旁边渲染按钮：
<button
  onClick={handleToggleFlag}
  className="ml-2 text-lg focus:outline-none"
  title={isFlagged ? '取消标记' : '标记为重要'}
>
  {isFlagged ? '★' : '☆'}
</button>
```

- [ ] **步骤 2：修改 NewsDetail.jsx**

类似地，在 `NewsDetail` 组件标题区域添加星形按钮和"预览推送"按钮：

```jsx
import { useState, useEffect } from 'react';
import { api } from '../services/api.js';

// 在组件内部添加：
const [isFlagged, setIsFlagged] = useState(false);
const [previewLoading, setPreviewLoading] = useState(false);

useEffect(() => {
  api.getFlaggedArticleIds().then((data) => {
    setIsFlagged(data.articleIds?.includes(article.id) || false);
  }).catch(() => {});
}, [article.id]);

const handleToggleFlag = async () => {
  try {
    const result = await api.toggleFlagArticle(article.id);
    setIsFlagged(result.flagged);
  } catch (err) {
    alert('标记失败：' + err.message);
  }
};

const handlePreview = async () => {
  setPreviewLoading(true);
  try {
    await api.sendPreview(article.id);
    alert('预览推送已发送，请检查微信公众号');
  } catch (err) {
    alert('预览推送失败：' + err.message);
  } finally {
    setPreviewLoading(false);
  }
};

// 在标题区域渲染：
<div className="flex items-center gap-2">
  <h1 className="text-2xl font-bold">{article.title}</h1>
  <button onClick={handleToggleFlag} className="text-xl" title={isFlagged ? '取消标记' : '标记为重要'}>
    {isFlagged ? '★' : '☆'}
  </button>
</div>

// 在合适位置添加预览按钮：
<button
  onClick={handlePreview}
  disabled={previewLoading}
  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
>
  {previewLoading ? '推送中...' : '推送到公众号预览'}
</button>
```

- [ ] **步骤 3：运行前端构建验证**

```bash
cd f:\program\ai\news\frontend; npm run build
```

预期：构建成功

- [ ] **步骤 4：Commit**

```bash
cd f:\program\ai\news; git add frontend/src/components/NewsCard.jsx frontend/src/components/NewsDetail.jsx
git commit -m "feat(ui): add flag important and wechat preview buttons to NewsCard and NewsDetail"
```

---

## 任务 10：WechatSettings 配置页面

**文件：**
- 创建：`frontend/src/components/WechatSettings.jsx`
- 修改：`frontend/src/App.jsx`

- [ ] **步骤 1：创建 WechatSettings.jsx**

创建 `frontend/src/components/WechatSettings.jsx`：

```jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

export default function WechatSettings() {
  const [settings, setSettings] = useState({
    appId: '',
    appSecret: '',
    previewOpenId: '',
    summaryPushEnabled: true,
    summaryPushCron: '0 8 * * *'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getWechatSettings()
      .then((data) => {
        if (data) {
          setSettings((prev) => ({ ...prev, ...data }));
        }
      })
      .catch((err) => console.error('加载配置失败:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await api.setWechatSettings({
        appId: settings.appId,
        appSecret: settings.appSecret,
        previewOpenId: settings.previewOpenId,
        summaryPushEnabled: settings.summaryPushEnabled,
        summaryPushCron: settings.summaryPushCron
      });
      setSettings((prev) => ({ ...prev, ...data }));
      alert('配置已保存');
    } catch (err) {
      alert('保存失败：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-gray-500">加载中...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">公众号推送配置</h1>
        <Link to="/" className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
          返回首页
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700">AppID</label>
          <input
            type="text"
            name="appId"
            value={settings.appId || ''}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="wx1234567890abcdef"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">AppSecret</label>
          <input
            type="password"
            name="appSecret"
            value={settings.appSecret || ''}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="请输入 AppSecret"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">预览目标 OpenID</label>
          <input
            type="text"
            name="previewOpenId"
            value={settings.previewOpenId || ''}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="o1234567890abcdef"
          />
          <p className="mt-1 text-xs text-gray-500">点击"推送到公众号预览"时，消息会发送到这个微信号的公众号会话中</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="summaryPushEnabled"
            checked={settings.summaryPushEnabled}
            onChange={handleChange}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label className="text-sm font-medium text-gray-700">启用定时汇总推送</label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">定时推送 Cron</label>
          <input
            type="text"
            name="summaryPushCron"
            value={settings.summaryPushCron || '0 8 * * *'}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="0 8 * * *"
          />
          <p className="mt-1 text-xs text-gray-500">默认每天早上 8:00，格式为 cron 表达式</p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **步骤 2：修改 App.jsx 添加路由**

在 `frontend/src/App.jsx` 中导入并添加路由：

```javascript
import WechatSettings from './components/WechatSettings.jsx';
```

在 `<Routes>` 中添加：

```jsx
<Route path="/wechat-settings" element={<WechatSettings />} />
```

- [ ] **步骤 3：在导航栏添加入口**

在 `frontend/src/App.jsx` 的 `Navbar` 组件中，在现有导航链接之后添加：

```jsx
<Link to="/wechat-settings" className="text-sm text-gray-600 hover:text-gray-900">公众号</Link>
```

- [ ] **步骤 4：运行前端构建验证**

```bash
cd f:\program\ai\news\frontend; npm run build
```

预期：构建成功

- [ ] **步骤 5：Commit**

```bash
cd f:\program\ai\news; git add frontend/src/components/WechatSettings.jsx frontend/src/App.jsx
git commit -m "feat(ui): add WechatSettings page for official account configuration"
```

---

## 任务 11：端到端测试与集成验证

**文件：**
- 运行所有测试

- [ ] **步骤 1：运行后端所有测试**

```bash
cd f:\program\ai\news\backend; npm test
```

预期：全部通过

- [ ] **步骤 2：运行前端构建**

```bash
cd f:\program\ai\news\frontend; npm run build
```

预期：构建成功

- [ ] **步骤 3：Commit**

```bash
cd f:\program\ai\news; git commit -m "test: verify wechat push feature e2e integration"
```

---

## 自检

**规格覆盖度检查：**
- 定时汇总推送：任务 7 覆盖
- 用户标记重要：任务 3、9 覆盖
- 手动预览推送：任务 6、9 覆盖
- 公众号配置管理：任务 2、10 覆盖
- access_token 缓存：任务 5 覆盖
- 错误处理：任务 5、6 覆盖
- 前端 UI：任务 8、9、10 覆盖

**无占位符。**
