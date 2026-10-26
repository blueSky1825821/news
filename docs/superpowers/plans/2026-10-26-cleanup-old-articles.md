# 定时清理旧新闻实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 新增每天零点自动清理 90 天前未标记新闻的定时任务，并支持手动触发。

**架构：** 在现有 `node-cron` 调度体系上新增一个 cleanup scheduler，通过环境变量控制开关和保留天数；Model 层提供 `cleanupOldArticles` 执行带条件（跳过标记文章）的硬删 SQL；路由层暴露手动触发接口供调试。

**技术栈：** Node.js, Express, node-cron, node:sqlite, Jest, supertest

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `backend/src/models/article.js` | 修改 | 新增 `cleanupOldArticles(retentionDays)`：执行 DELETE，返回删除行数 |
| `backend/src/services/scheduler.js` | 修改 | 新增 `startCleanupScheduler()` / `stopCleanupScheduler()`：读取环境变量，注册每日 00:00 cron |
| `backend/src/server.js` | 修改 | 服务启动时调用 `startCleanupScheduler()` |
| `backend/src/routes/crawl.js` | 修改 | 新增 `POST /api/crawl/cleanup/trigger`：手动触发清理 |
| `backend/tests/cleanup.test.js` | 创建 | 覆盖 model 层删除逻辑和 API 手动触发接口 |

---

## 任务 1：模型层 cleanupOldArticles

**文件：**
- 修改：`backend/src/models/article.js`
- 测试：`backend/tests/cleanup.test.js`

- [ ] **步骤 1：编写失败的测试**

创建 `backend/tests/cleanup.test.js`，导入尚未实现的 `cleanupOldArticles`：

```javascript
import { jest } from '@jest/globals';
import { getDb, closeDb, initSchema } from '../src/db.js';
import { insertSource, getAllSources } from '../src/models/source.js';
import { cleanupOldArticles } from '../src/models/article.js';
import { flagArticle } from '../src/models/articleFlag.js';

describe('Cleanup Model', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
    insertSource({ name: 'Test', rssUrl: 'http://test.com/rss', category: 'tech', isActive: 1 });
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('deletes only old unflagged articles', () => {
    const db = getDb();
    const source = getAllSources()[0];

    db.prepare(`
      INSERT INTO articles (title, originalUrl, sourceId, fetchedAt)
      VALUES (?, ?, ?, datetime('now', '-100 days'))
    `).run('Old Article', 'http://example.com/old', source.id);

    db.prepare(`
      INSERT INTO articles (title, originalUrl, sourceId, fetchedAt)
      VALUES (?, ?, ?, datetime('now', '-1 days'))
    `).run('Recent Article', 'http://example.com/recent', source.id);

    db.prepare(`
      INSERT INTO articles (title, originalUrl, sourceId, fetchedAt)
      VALUES (?, ?, ?, datetime('now', '-100 days'))
    `).run('Old Flagged Article', 'http://example.com/flagged', source.id);
    const flaggedId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    flagArticle(flaggedId);

    const deleted = cleanupOldArticles(90);
    expect(deleted).toBe(1);

    const remaining = db.prepare('SELECT title FROM articles ORDER BY title').all();
    expect(remaining.map(r => r.title)).toEqual(['Old Flagged Article', 'Recent Article']);
  });

  it('returns 0 when no articles match', () => {
    const db = getDb();
    const source = getAllSources()[0];

    db.prepare(`
      INSERT INTO articles (title, originalUrl, sourceId, fetchedAt)
      VALUES (?, ?, ?, datetime('now', '-1 days'))
    `).run('Recent Article', 'http://example.com/recent', source.id);

    const deleted = cleanupOldArticles(90);
    expect(deleted).toBe(0);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：
```bash
cd f:\program\ai\news\backend
npm test -- cleanup.test.js
```

预期：FAIL，报错 `cleanupOldArticles is not a function` 或 `SyntaxError: The requested module '../src/models/article.js' does not provide an export named 'cleanupOldArticles'`

- [ ] **步骤 3：编写最少实现代码**

在 `backend/src/models/article.js` 末尾追加：

```javascript
export function cleanupOldArticles(retentionDays) {
  const db = getDb();
  const stmt = db.prepare(`
    DELETE FROM articles
    WHERE fetchedAt < datetime('now', '-' || ? || ' days')
      AND NOT EXISTS (
        SELECT 1 FROM article_flags WHERE articleId = articles.id
      )
  `);
  const result = stmt.run(retentionDays);
  return result.changes;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：
```bash
cd f:\program\ai\news\backend
npm test -- cleanup.test.js
```

预期：PASS，2 个测试全部通过

- [ ] **步骤 5：Commit**

```bash
cd f:\program\ai\news
git add backend/src/models/article.js backend/tests/cleanup.test.js
git commit -m "feat: add cleanupOldArticles model function"
```

---

## 任务 2：调度器层 startCleanupScheduler / stopCleanupScheduler

**文件：**
- 修改：`backend/src/services/scheduler.js`
- 测试：`backend/tests/cleanup.test.js`

- [ ] **步骤 1：编写失败的测试**

在 `backend/tests/cleanup.test.js` 中追加 scheduler 测试（放在文件底部，在最后一个 `});` 之前）：

```javascript
describe('Cleanup Scheduler', () => {
  let cronMock;

  beforeEach(async () => {
    jest.resetModules();
    cronMock = { schedule: jest.fn(() => ({ stop: jest.fn() })) };
    jest.unstable_mockModule('node-cron', () => cronMock);
  });

  afterEach(() => {
    delete process.env.CLEANUP_ENABLED;
    delete process.env.CLEANUP_RETENTION_DAYS;
  });

  it('does not register cron when CLEANUP_ENABLED=false', async () => {
    process.env.CLEANUP_ENABLED = 'false';
    const { startCleanupScheduler } = await import('../src/services/scheduler.js');
    startCleanupScheduler();
    expect(cronMock.schedule).not.toHaveBeenCalled();
  });

  it('registers cron with default retention when env is invalid', async () => {
    process.env.CLEANUP_RETENTION_DAYS = 'abc';
    const { startCleanupScheduler } = await import('../src/services/scheduler.js');
    startCleanupScheduler();
    expect(cronMock.schedule).toHaveBeenCalledTimes(1);
    expect(cronMock.schedule.mock.calls[0][0]).toBe('0 0 * * *');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：
```bash
cd f:\program\ai\news\backend
npm test -- cleanup.test.js
```

预期：FAIL，`startCleanupScheduler is not a function`

- [ ] **步骤 3：编写最少实现代码**

在 `backend/src/services/scheduler.js` 中，在 `stopSummaryPushScheduler` 之后追加：

```javascript
let cleanupTask = null;

export function startCleanupScheduler() {
  if (cleanupTask) return;
  if (process.env.CLEANUP_ENABLED === 'false') {
    console.log('[Cleanup] Disabled.');
    return;
  }

  let retentionDays = parseInt(process.env.CLEANUP_RETENTION_DAYS, 10);
  if (!Number.isFinite(retentionDays) || retentionDays < 1) {
    console.warn('[Cleanup] Invalid CLEANUP_RETENTION_DAYS, using default 90.');
    retentionDays = 90;
  }

  cleanupTask = cron.schedule('0 0 * * *', async () => {
    try {
      const deleted = cleanupOldArticles(retentionDays);
      console.log(`[Cleanup] Deleted ${deleted} old articles.`);
    } catch (err) {
      console.error('[Cleanup] Failed:', err.message);
    }
  }, {
    timezone: 'Asia/Shanghai'
  });

  console.log(`[Cleanup] Scheduler started. Retention: ${retentionDays} days.`);
}

export function stopCleanupScheduler() {
  if (cleanupTask) {
    cleanupTask.stop();
    cleanupTask = null;
    console.log('[Cleanup] Scheduler stopped.');
  }
}
```

并在文件顶部确认已导入 `cleanupOldArticles`（如果已有 `import { getDb }` 等，只需在已有 import 中追加或新增一行）：

```javascript
import { cleanupOldArticles } from '../models/article.js';
```

- [ ] **步骤 4：运行测试验证通过**

运行：
```bash
cd f:\program\ai\news\backend
npm test -- cleanup.test.js
```

预期：PASS，4 个测试全部通过

- [ ] **步骤 5：Commit**

```bash
cd f:\program\ai\news
git add backend/src/services/scheduler.js backend/tests/cleanup.test.js
git commit -m "feat: add cleanup scheduler with env-based config"
```

---

## 任务 3：服务启动与手动触发接口

**文件：**
- 修改：`backend/src/server.js`
- 修改：`backend/src/routes/crawl.js`
- 测试：`backend/tests/cleanup.test.js`

- [ ] **步骤 1：修改 server.js 启动 cleanup scheduler**

修改 `backend/src/server.js`，将：

```javascript
import { startScheduler, startSummaryPushScheduler } from './services/scheduler.js';
```

改为：

```javascript
import { startScheduler, startSummaryPushScheduler, startCleanupScheduler } from './services/scheduler.js';
```

并在 `startSummaryPushScheduler();` 之后追加：

```javascript
startCleanupScheduler();
```

- [ ] **步骤 2：修改 crawl.js 新增手动触发路由**

在 `backend/src/routes/crawl.js` 顶部追加导入：

```javascript
import { cleanupOldArticles } from '../models/article.js';
```

在文件末尾（`export default router;` 之前）追加：

```javascript
router.post('/cleanup/trigger', async (req, res, next) => {
  try {
    let retentionDays = parseInt(process.env.CLEANUP_RETENTION_DAYS, 10);
    if (!Number.isFinite(retentionDays) || retentionDays < 1) {
      retentionDays = 90;
    }
    const deleted = cleanupOldArticles(retentionDays);
    res.sendJson(0, 'Cleanup finished', { deleted });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **步骤 3：编写集成测试**

在 `backend/tests/cleanup.test.js` 底部追加（放在文件最后的 `});` 之前）：

```javascript
describe('Cleanup API', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
    insertSource({ name: 'Test', rssUrl: 'http://test.com/rss', category: 'tech', isActive: 1 });
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
    delete process.env.CLEANUP_RETENTION_DAYS;
  });

  it('POST /api/crawl/cleanup/trigger performs cleanup', async () => {
    const db = getDb();
    const source = getAllSources()[0];

    db.prepare(`
      INSERT INTO articles (title, originalUrl, sourceId, fetchedAt)
      VALUES (?, ?, ?, datetime('now', '-100 days'))
    `).run('Old Article', 'http://example.com/old', source.id);

    const res = await request(app).post('/api/crawl/cleanup/trigger');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.deleted).toBe(1);

    const remaining = db.prepare('SELECT COUNT(*) as count FROM articles').get();
    expect(remaining.count).toBe(0);
  });
});
```

并在文件顶部追加 `request` 和 `app` 的导入：

```javascript
import request from 'supertest';
import { app } from '../src/app.js';
```

- [ ] **步骤 4：运行全部测试**

运行：
```bash
cd f:\program\ai\news\backend
npm test
```

预期：所有测试通过（包括原有的 articles.test.js、crawler.test.js 等），新增 5 个 cleanup 测试也全部通过

- [ ] **步骤 5：Commit**

```bash
cd f:\program\ai\news
git add backend/src/server.js backend/src/routes/crawl.js backend/tests/cleanup.test.js
git commit -m "feat: add cleanup trigger endpoint and wire up scheduler"
```

---

## 自检

**1. 规格覆盖度：**
- [x] 每天零点定时任务 — 任务 2 中 `cron.schedule('0 0 * * *')` 实现
- [x] 硬删除 90 天前新闻 — 任务 1 中 `DELETE ... fetchedAt < datetime('now', '-? days')` 实现
- [x] 基于 fetchedAt — SQL 中使用 `fetchedAt`
- [x] 跳过被标记文章 — SQL 中 `NOT EXISTS (SELECT 1 FROM article_flags ...)` 实现
- [x] 环境变量配置 — 任务 2 中读取 `CLEANUP_ENABLED` 和 `CLEANUP_RETENTION_DAYS`
- [x] 手动触发接口 — 任务 3 中 `POST /api/crawl/cleanup/trigger`
- [x] 错误处理（非法配置回退、SQL 异常 catch）— 任务 2/3 中均有实现
- [x] 测试覆盖 — 任务 1/2/3 中分别覆盖 model、scheduler、API

**2. 占位符扫描：** 无 TODO、无"后续实现"、无"适当错误处理"等模糊描述，每个步骤均包含实际代码和命令。

**3. 类型一致性：** `cleanupOldArticles` 签名始终为 `(retentionDays) => changes`；环境变量名称在 scheduler 和路由中保持一致；路由路径始终为 `/cleanup/trigger`。

---

## 执行交接

**计划已完成并保存到 `docs/superpowers/plans/2026-10-26-cleanup-old-articles.md`。两种执行方式：**

**1. 子代理驱动（推荐）** — 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** — 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？**
