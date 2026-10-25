# News Headline Broadcasting System — Implementation Plan

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 构建一个前后端分离的新闻头条播报系统，后端定时爬取RSS并暴露REST API，前端展示新闻列表、详情、支持语音播报和全部自动播报。

**架构：** 后端使用 Node.js + Express + SQLite 提供 RESTful API 和定时爬虫；前端使用 React + Vite + Tailwind CSS 消费 API，通过浏览器 Web Speech API 实现语音播报。前后端通过 HTTP REST 通信。

**技术栈：** Node.js 20+, Express 4, better-sqlite3, rss-parser, node-cron, Jest, Supertest, React 18, Vite 5, Tailwind CSS 3, DOMPurify, Web Speech API

---

## 文件结构

### Backend (`/backend`)

| File | Responsibility |
|------|---------------|
| `package.json` | Backend dependencies and scripts |
| `.gitignore` | Ignore node_modules, DB file, coverage |
| `src/db.js` | SQLite connection, schema initialization |
| `src/models/source.js` | `sources` table CRUD operations |
| `src/models/article.js` | `articles` table CRUD + list queries |
| `src/services/crawler.js` | RSS fetching, parsing, normalization, dedup insertion |
| `src/services/scheduler.js` | node-cron wrapper to trigger crawler |
| `src/middleware/responseWrapper.js` | Unified `{code, message, data}` response wrapper |
| `src/middleware/errorHandler.js` | Global Express error handler with unified format |
| `src/routes/articles.js` | `GET /api/articles`, `GET /api/articles/:id` |
| `src/routes/sources.js` | `GET /api/sources` |
| `src/routes/crawl.js` | `POST /api/crawl/trigger` |
| `src/app.js` | Express app setup, middleware mounting, route registration |
| `src/server.js` | Server bootstrap, port listening, scheduler start |
| `tests/crawler.test.js` | Crawler unit tests (mocked RSS) |
| `tests/articles.test.js` | Articles API integration tests |

### Frontend (`/frontend`)

| File | Responsibility |
|------|---------------|
| `package.json` | Frontend dependencies and scripts |
| `index.html` | HTML entry point |
| `vite.config.js` | Vite configuration with proxy to backend |
| `tailwind.config.js` | Tailwind CSS configuration |
| `src/main.jsx` | React DOM render entry |
| `src/index.css` | Tailwind directives + custom styles |
| `src/App.jsx` | Root component with React Router routes |
| `src/services/api.js` | HTTP client wrapper (fetch-based), unified error handling |
| `src/hooks/useSpeech.js` | Web Speech API hook: speak, pause, resume, cancel, queue management |
| `src/components/NewsList.jsx` | News list page: fetch articles, render cards, source filter |
| `src/components/NewsCard.jsx` | Single news card: title, summary, source badge, time, actions |
| `src/components/NewsDetail.jsx` | Detail page: sanitized HTML content with images/video, back button |
| `src/components/SourceFilter.jsx` | Dropdown to filter articles by source |
| `src/components/AutoPlayBar.jsx` | Floating control bar for "全部播报": play/pause/stop/next/progress |

---

## Phase 1: Backend

### Task 1: Initialize Backend Project

**文件：**
- 创建：`backend/package.json`
- 创建：`backend/.gitignore`

- [ ] **步骤 1：创建 `backend/package.json`**

```json
{
  "name": "news-broadcasting-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "node src/server.js",
    "test": "NODE_OPTIONS='--experimental-vm-modules' jest",
    "test:watch": "NODE_OPTIONS='--experimental-vm-modules' jest --watch"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "node-cron": "^3.0.3",
    "rss-parser": "^3.13.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  },
  "jest": {
    "testEnvironment": "node",
    "transform": {}
  }
}
```

- [ ] **步骤 2：创建 `backend/.gitignore`**

```
node_modules/
*.db
*.db-journal
coverage/
```

- [ ] **步骤 3：安装依赖并验证**

运行：`cd backend && npm install`
预期：`node_modules/` 创建成功，无报错

- [ ] **步骤 4：Commit**

```bash
git add backend/
git commit -m "chore: initialize backend project with dependencies"
```

---

### Task 2: Database Layer

**文件：**
- 创建：`backend/src/db.js`
- 创建：`backend/src/models/source.js`
- 创建：`backend/src/models/article.js`
- 创建：`backend/tests/db.test.js`

- [ ] **步骤 1：编写失败的测试 `backend/tests/db.test.js`**

```javascript
import Database from 'better-sqlite3';
import { initSchema } from '../src/db.js';

describe('Database Schema', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  test('initSchema creates sources and articles tables', () => {
    initSchema(db);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('sources');
    expect(tableNames).toContain('articles');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd backend && npm test -- tests/db.test.js`
预期：FAIL — `Cannot find module '../src/db.js'`

- [ ] **步骤 3：实现 `backend/src/db.js`**

```javascript
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/news.db');

export function createConnection() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  return db;
}

export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rssUrl TEXT NOT NULL UNIQUE,
      category TEXT,
      isActive BOOLEAN NOT NULL DEFAULT 1,
      fetchIntervalMinutes INTEGER NOT NULL DEFAULT 30,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT,
      originalUrl TEXT NOT NULL UNIQUE,
      sourceId INTEGER NOT NULL,
      publishedAt DATETIME,
      fetchedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      isRead BOOLEAN NOT NULL DEFAULT 0,
      FOREIGN KEY (sourceId) REFERENCES sources(id)
    );

    CREATE INDEX IF NOT EXISTS idx_articles_sourceId ON articles(sourceId);
    CREATE INDEX IF NOT EXISTS idx_articles_publishedAt ON articles(publishedAt DESC);
  `);
}

let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    dbInstance = createConnection();
    initSchema(dbInstance);
  }
  return dbInstance;
}
```

- [ ] **步骤 4：实现 `backend/src/models/source.js`**

```javascript
import { getDb } from '../db.js';

export function getAllSources() {
  const db = getDb();
  return db.prepare('SELECT * FROM sources ORDER BY id').all();
}

export function getActiveSources() {
  const db = getDb();
  return db.prepare('SELECT * FROM sources WHERE isActive = 1 ORDER BY id').all();
}

export function insertSource(source) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO sources (name, rssUrl, category, isActive, fetchIntervalMinutes)
    VALUES (@name, @rssUrl, @category, @isActive, @fetchIntervalMinutes)
    ON CONFLICT(rssUrl) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      isActive = excluded.isActive,
      fetchIntervalMinutes = excluded.fetchIntervalMinutes
  `);
  return stmt.run(source);
}
```

- [ ] **步骤 5：实现 `backend/src/models/article.js`**

```javascript
import { getDb } from '../db.js';

export function listArticles({ page = 1, limit = 20, sourceId = null, category = null } = {}) {
  const db = getDb();
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params = {};

  if (sourceId) {
    whereClause += ' AND a.sourceId = @sourceId';
    params.sourceId = Number(sourceId);
  }
  if (category) {
    whereClause += ' AND s.category = @category';
    params.category = category;
  }

  const countStmt = db.prepare(`
    SELECT COUNT(*) as total FROM articles a
    JOIN sources s ON a.sourceId = s.id
    ${whereClause}
  `);
  const { total } = countStmt.get(params);

  const stmt = db.prepare(`
    SELECT a.id, a.title, a.summary, a.originalUrl, a.publishedAt, a.isRead,
           s.name as sourceName, s.category
    FROM articles a
    JOIN sources s ON a.sourceId = s.id
    ${whereClause}
    ORDER BY a.publishedAt DESC
    LIMIT @limit OFFSET @offset
  `);

  const items = stmt.all({ ...params, limit: Number(limit), offset });
  const totalPages = Math.ceil(total / limit);

  return { items, pagination: { page: Number(page), limit: Number(limit), total, totalPages } };
}

export function getArticleById(id) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT a.*, s.name as sourceName, s.category
    FROM articles a
    JOIN sources s ON a.sourceId = s.id
    WHERE a.id = ?
  `);
  return stmt.get(id);
}

export function insertArticle(article) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO articles
    (title, summary, content, originalUrl, sourceId, publishedAt)
    VALUES (@title, @summary, @content, @originalUrl, @sourceId, @publishedAt)
  `);
  return stmt.run(article);
}
```

- [ ] **步骤 6：运行测试验证通过**

运行：`cd backend && npm test -- tests/db.test.js`
预期：PASS

- [ ] **步骤 7：Commit**

```bash
git add backend/src/db.js backend/src/models/ backend/tests/db.test.js
git commit -m "feat: add database layer with sources and articles models"
```

---

### Task 3: Response Wrapper & Error Handler

**文件：**
- 创建：`backend/src/middleware/responseWrapper.js`
- 创建：`backend/src/middleware/errorHandler.js`
- 创建：`backend/tests/middleware.test.js`

- [ ] **步骤 1：编写失败的测试 `backend/tests/middleware.test.js`**

```javascript
import request from 'supertest';
import express from 'express';

jest.unstable_mockModule('../src/db.js', () => ({
  getDb: jest.fn()
}));

describe('Response Wrapper', () => {
  test('wraps successful response with unified format', async () => {
    const { responseWrapper } = await import('../src/middleware/responseWrapper.js');
    const app = express();
    app.use(responseWrapper);
    app.get('/test', (req, res) => res.sendJson(0, 'success', { foo: 'bar' }));

    const res = await request(app).get('/test');
    expect(res.body).toEqual({ code: 0, message: 'success', data: { foo: 'bar' } });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd backend && npm test -- tests/middleware.test.js`
预期：FAIL — middleware modules not found

- [ ] **步骤 3：实现 `backend/src/middleware/responseWrapper.js`**

```javascript
export function responseWrapper(req, res, next) {
  res.sendJson = (code, message, data = null) => {
    res.json({ code, message, data });
  };
  next();
}
```

- [ ] **步骤 4：实现 `backend/src/middleware/errorHandler.js`**

```javascript
export function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || statusCode;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({ code, message, data: null });
}
```

- [ ] **步骤 5：运行测试验证通过**

运行：`cd backend && npm test -- tests/middleware.test.js`
预期：PASS

- [ ] **步骤 6：Commit**

```bash
git add backend/src/middleware/ backend/tests/middleware.test.js
git commit -m "feat: add unified response wrapper and error handler middleware"
```

---

### Task 4: RSS Crawler Service (TDD)

**文件：**
- 创建：`backend/src/services/crawler.js`
- 创建：`backend/tests/crawler.test.js`

- [ ] **步骤 1：编写失败的测试 `backend/tests/crawler.test.js`**

```javascript
import { jest } from '@jest/globals';

jest.unstable_mockModule('../src/db.js', () => ({
  getDb: jest.fn(() => ({
    prepare: jest.fn(() => ({ run: jest.fn() })),
    exec: jest.fn()
  }))
}));

jest.unstable_mockModule('rss-parser', () => ({
  default: jest.fn().mockImplementation(() => ({
    parseURL: jest.fn()
  }))
}));

describe('Crawler', () => {
  test('crawlSource fetches and normalizes RSS items', async () => {
    const { crawlSource } = await import('../src/services/crawler.js');
    const mockParser = (await import('rss-parser')).default;
    const mockParseURL = mockParser.mock.results[0].value.parseURL;

    mockParseURL.mockResolvedValue({
      items: [
        {
          title: 'Test News',
          contentSnippet: 'Summary text',
          'content:encoded': '<p>Full content</p>',
          link: 'http://example.com/1',
          pubDate: 'Mon, 30 Jun 2026 08:00:00 GMT',
          isoDate: '2026-06-30T08:00:00.000Z'
        }
      ]
    });

    const result = await crawlSource({ id: 1, rssUrl: 'http://feed.test' });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test News');
    expect(result[0].originalUrl).toBe('http://example.com/1');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd backend && npm test -- tests/crawler.test.js`
预期：FAIL — `crawler.js` not found or `crawlSource` not exported

- [ ] **步骤 3：实现 `backend/src/services/crawler.js`**

```javascript
import Parser from 'rss-parser';
import { insertArticle } from '../models/article.js';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'NewsBroadcastingBot/1.0' }
});

export async function crawlSource(source) {
  const feed = await parser.parseURL(source.rssUrl);
  const articles = [];

  for (const item of feed.items || []) {
    const article = {
      title: item.title || '',
      summary: item.contentSnippet || item.description || '',
      content: item['content:encoded'] || item.content || item.description || '',
      originalUrl: item.link || item.guid || '',
      sourceId: source.id,
      publishedAt: item.isoDate ? new Date(item.isoDate).toISOString() : new Date().toISOString()
    };

    if (!article.title || !article.originalUrl) continue;

    try {
      insertArticle(article);
      articles.push(article);
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        // Duplicate, silently skip
      } else {
        console.error(`Failed to insert article: ${article.title}`, err.message);
      }
    }
  }

  return articles;
}

export async function crawlAllSources(sources) {
  const results = [];
  for (const source of sources) {
    try {
      const articles = await crawlSource(source);
      results.push({ source: source.name, count: articles.length, error: null });
    } catch (err) {
      console.error(`Crawl failed for ${source.name}:`, err.message);
      results.push({ source: source.name, count: 0, error: err.message });
    }
  }
  return results;
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cd backend && npm test -- tests/crawler.test.js`
预期：PASS

- [ ] **步骤 5：Commit**

```bash
git add backend/src/services/crawler.js backend/tests/crawler.test.js
git commit -m "feat: add RSS crawler service with deduplication"
```

---

### Task 5: Scheduler Service

**文件：**
- 创建：`backend/src/services/scheduler.js`

- [ ] **步骤 1：实现 `backend/src/services/scheduler.js`**

```javascript
import cron from 'node-cron';
import { getActiveSources } from '../models/source.js';
import { crawlAllSources } from './crawler.js';

let scheduledTask = null;

export function startScheduler(cronExpression = '*/30 * * * *') {
  if (scheduledTask) {
    scheduledTask.stop();
  }

  scheduledTask = cron.schedule(cronExpression, async () => {
    console.log(`[${new Date().toISOString()}] Starting scheduled crawl...`);
    const sources = getActiveSources();
    const results = await crawlAllSources(sources);
    const total = results.reduce((sum, r) => sum + r.count, 0);
    console.log(`Crawl complete. Added ${total} new articles.`);
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai'
  });

  console.log(`Scheduler started with cron: ${cronExpression}`);
}

export function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

export function triggerManualCrawl() {
  const sources = getActiveSources();
  return crawlAllSources(sources);
}
```

- [ ] **步骤 2：Commit**

```bash
git add backend/src/services/scheduler.js
git commit -m "feat: add cron scheduler for periodic RSS crawling"
```

---

### Task 6: API Routes

**文件：**
- 创建：`backend/src/routes/articles.js`
- 创建：`backend/src/routes/sources.js`
- 创建：`backend/src/routes/crawl.js`
- 创建：`backend/tests/articles.test.js`

- [ ] **步骤 1：实现 `backend/src/routes/articles.js`**

```javascript
import { Router } from 'express';
import { listArticles, getArticleById } from '../models/article.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const { page, limit, sourceId, category } = req.query;
    const result = listArticles({ page, limit, sourceId, category });
    res.sendJson(0, 'success', result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const article = getArticleById(req.params.id);
    if (!article) {
      const err = new Error('Article not found');
      err.statusCode = 404;
      err.code = 1001;
      throw err;
    }
    res.sendJson(0, 'success', article);
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **步骤 2：实现 `backend/src/routes/sources.js`**

```javascript
import { Router } from 'express';
import { getAllSources } from '../models/source.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const sources = getAllSources();
    res.sendJson(0, 'success', sources);
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **步骤 3：实现 `backend/src/routes/crawl.js`**

```javascript
import { Router } from 'express';
import { triggerManualCrawl } from '../services/scheduler.js';

const router = Router();

router.post('/trigger', async (req, res, next) => {
  try {
    triggerManualCrawl();
    res.sendJson(0, 'Crawl triggered', null);
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **步骤 4：编写 API 集成测试 `backend/tests/articles.test.js`**

```javascript
import request from 'supertest';
import express from 'express';

jest.unstable_mockModule('../src/db.js', () => ({
  getDb: jest.fn(() => ({
    prepare: jest.fn(() => ({
      all: jest.fn(() => []),
      get: jest.fn(() => ({ total: 0 })),
      run: jest.fn()
    })),
    exec: jest.fn()
  }))
}));

describe('Articles API', () => {
  let app;

  beforeEach(async () => {
    const { responseWrapper } = await import('../src/middleware/responseWrapper.js');
    const { errorHandler } = await import('../src/middleware/errorHandler.js');
    const articlesRouter = (await import('../src/routes/articles.js')).default;

    app = express();
    app.use(responseWrapper);
    app.use('/api/articles', articlesRouter);
    app.use(errorHandler);
  });

  test('GET /api/articles returns paginated list', async () => {
    const res = await request(app).get('/api/articles');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('pagination');
  });
});
```

- [ ] **步骤 5：运行测试验证通过**

运行：`cd backend && npm test -- tests/articles.test.js`
预期：PASS

- [ ] **步骤 6：Commit**

```bash
git add backend/src/routes/ backend/tests/articles.test.js
git commit -m "feat: add REST API routes for articles, sources, and crawl trigger"
```

---

### Task 7: Server Entry & Seed Data

**文件：**
- 创建：`backend/src/app.js`
- 创建：`backend/src/server.js`
- 创建：`backend/src/seed.js`

- [ ] **步骤 1：实现 `backend/src/app.js`**

```javascript
import express from 'express';
import cors from 'cors';
import { responseWrapper } from './middleware/responseWrapper.js';
import { errorHandler } from './middleware/errorHandler.js';
import articlesRouter from './routes/articles.js';
import sourcesRouter from './routes/sources.js';
import crawlRouter from './routes/crawl.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(responseWrapper);

app.use('/api/articles', articlesRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/crawl', crawlRouter);

app.use(errorHandler);

export default app;
```

- [ ] **步骤 2：实现 `backend/src/server.js`**

```javascript
import app from './app.js';
import { getDb, initSchema } from './db.js';
import { startScheduler } from './services/scheduler.js';
import { seedSources } from './seed.js';

const PORT = process.env.PORT || 3001;

// Initialize DB
const db = getDb();
initSchema(db);

// Seed initial sources
seedSources();

// Start scheduler
startScheduler();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

- [ ] **步骤 3：实现 `backend/src/seed.js`**

```javascript
import { insertSource } from './models/source.js';

const INITIAL_SOURCES = [
  { name: '人民日报-时政', rssUrl: 'http://www.people.com.cn/rss/politics.xml', category: 'politics', isActive: 1, fetchIntervalMinutes: 30 },
  { name: '人民日报-社会', rssUrl: 'http://www.people.com.cn/rss/society.xml', category: 'society', isActive: 1, fetchIntervalMinutes: 30 },
  { name: '人民日报-国际', rssUrl: 'http://www.people.com.cn/rss/world.xml', category: 'world', isActive: 1, fetchIntervalMinutes: 30 },
  { name: '新浪新闻-要闻', rssUrl: 'http://rss.sina.com.cn/news/index.shtml', category: 'general', isActive: 1, fetchIntervalMinutes: 30 }
];

export function seedSources() {
  for (const source of INITIAL_SOURCES) {
    try {
      insertSource(source);
    } catch (err) {
      console.log(`Source already exists: ${source.name}`);
    }
  }
}
```

- [ ] **步骤 4：启动后端验证**

运行：`cd backend && node src/server.js`
预期：控制台输出 `Server running on http://localhost:3001`
按 `Ctrl+C` 停止

- [ ] **步骤 5：手动测试 API**

运行：`curl http://localhost:3001/api/sources`
预期：返回包含4个初始源的JSON

- [ ] **步骤 6：Commit**

```bash
git add backend/src/app.js backend/src/server.js backend/src/seed.js
git commit -m "feat: add server entry, seed initial RSS sources, start scheduler"
```

---

## Phase 2: Frontend

### Task 8: Initialize Frontend Project

**文件：**
- 创建：`frontend/package.json`
- 创建：`frontend/index.html`
- 创建：`frontend/vite.config.js`
- 创建：`frontend/tailwind.config.js`
- 创建：`frontend/src/index.css`
- 创建：`frontend/src/main.jsx`

- [ ] **步骤 1：创建 `frontend/package.json`**

```json
{
  "name": "news-broadcasting-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "dompurify": "^3.1.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.24.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "vite": "^5.3.1"
  }
}
```

- [ ] **步骤 2：创建 `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>新闻头条播报</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **步骤 3：创建 `frontend/vite.config.js`**

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
```

- [ ] **步骤 4：创建 `frontend/tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {}
  },
  plugins: []
};
```

- [ ] **步骤 5：创建 `frontend/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

- [ ] **步骤 6：创建 `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-50 text-gray-900;
}
```

- [ ] **步骤 7：创建 `frontend/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **步骤 8：安装依赖**

运行：`cd frontend && npm install`
预期：`node_modules/` 创建成功

- [ ] **步骤 9：Commit**

```bash
git add frontend/
git commit -m "chore: initialize frontend project with React, Vite, Tailwind"
```

---

### Task 9: API Client Service

**文件：**
- 创建：`frontend/src/services/api.js`

- [ ] **步骤 1：实现 `frontend/src/services/api.js`**

```javascript
const API_BASE = '';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const data = await res.json().catch(() => ({ code: -1, message: 'Invalid JSON' }));

  if (!res.ok || data.code !== 0) {
    const err = new Error(data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }

  return data.data;
}

export const api = {
  getArticles: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/api/articles?${query}`);
  },
  getArticle: (id) => request(`/api/articles/${id}`),
  getSources: () => request('/api/sources'),
  triggerCrawl: () => request('/api/crawl/trigger', { method: 'POST' })
};
```

- [ ] **步骤 2：Commit**

```bash
git add frontend/src/services/api.js
git commit -m "feat: add frontend API client with unified error handling"
```

---

### Task 10: useSpeech Hook

**文件：**
- 创建：`frontend/src/hooks/useSpeech.js`

- [ ] **步骤 1：实现 `frontend/src/hooks/useSpeech.js`**

```javascript
import { useState, useCallback, useRef, useEffect } from 'react';

export function useSpeech() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const queueRef = useRef([]);
  const utteranceRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);

  const isSupported = 'speechSynthesis' in window;

  const speakNext = useCallback(() => {
    const queue = queueRef.current;
    const idx = currentIndex + 1;
    if (idx >= queue.length) {
      setIsPlaying(false);
      setCurrentIndex(-1);
      return;
    }

    setCurrentIndex(idx);
    const text = queue[idx];
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      speakNext();
    };

    utterance.onerror = (e) => {
      console.error('Speech error:', e);
      setIsPlaying(false);
    };

    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
    setIsPlaying(true);
  }, [currentIndex]);

  const playQueue = useCallback((texts) => {
    if (!isSupported || !texts || texts.length === 0) return;
    synthRef.current.cancel();
    queueRef.current = texts;
    setCurrentIndex(-1);
    speakNext();
  }, [isSupported, speakNext]);

  const playSingle = useCallback((text) => {
    if (!isSupported) return;
    synthRef.current.cancel();
    queueRef.current = [text];
    setCurrentIndex(-1);
    speakNext();
  }, [isSupported, speakNext]);

  const pause = useCallback(() => {
    synthRef.current.pause();
    setIsPlaying(false);
  }, []);

  const resume = useCallback(() => {
    synthRef.current.resume();
    setIsPlaying(true);
  }, []);

  const stop = useCallback(() => {
    synthRef.current.cancel();
    setIsPlaying(false);
    setCurrentIndex(-1);
    queueRef.current = [];
  }, []);

  const next = useCallback(() => {
    synthRef.current.cancel();
    speakNext();
  }, [speakNext]);

  useEffect(() => {
    return () => {
      synthRef.current.cancel();
    };
  }, []);

  return {
    isSupported,
    isPlaying,
    currentIndex,
    playQueue,
    playSingle,
    pause,
    resume,
    stop,
    next
  };
}
```

- [ ] **步骤 2：Commit**

```bash
git add frontend/src/hooks/useSpeech.js
git commit -m "feat: add useSpeech hook for browser TTS playback"
```

---

### Task 11: NewsCard & SourceFilter Components

**文件：**
- 创建：`frontend/src/components/NewsCard.jsx`
- 创建：`frontend/src/components/SourceFilter.jsx`

- [ ] **步骤 1：实现 `frontend/src/components/NewsCard.jsx`**

```jsx
import { Link } from 'react-router-dom';

export function NewsCard({ article, isActive, onPlay }) {
  return (
    <div className={`p-4 bg-white rounded-lg shadow border transition-colors ${isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-lg font-semibold text-gray-900 leading-tight">
          <Link to={`/article/${article.id}`} className="hover:text-blue-600">
            {article.title}
          </Link>
        </h3>
        <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded whitespace-nowrap ml-2">
          {article.sourceName}
        </span>
      </div>
      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{article.summary}</p>
      <div className="flex justify-between items-center text-xs text-gray-400">
        <span>{new Date(article.publishedAt).toLocaleString('zh-CN')}</span>
        <button
          onClick={() => onPlay(article.summary)}
          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          播报
        </button>
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：实现 `frontend/src/components/SourceFilter.jsx`**

```jsx
export function SourceFilter({ sources, selectedId, onChange }) {
  return (
    <div className="mb-4">
      <select
        value={selectedId || ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">全部来源</option>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **步骤 3：Commit**

```bash
git add frontend/src/components/NewsCard.jsx frontend/src/components/SourceFilter.jsx
git commit -m "feat: add NewsCard and SourceFilter components"
```

---

### Task 12: AutoPlayBar Component

**文件：**
- 创建：`frontend/src/components/AutoPlayBar.jsx`

- [ ] **步骤 1：实现 `frontend/src/components/AutoPlayBar.jsx`**

```jsx
export function AutoPlayBar({ isPlaying, currentIndex, total, onPause, onResume, onStop, onNext }) {
  if (total === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-50">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="text-sm text-gray-600">
          播报进度：<span className="font-semibold">{currentIndex + 1}</span> / {total}
        </div>
        <div className="flex gap-2">
          {isPlaying ? (
            <button onClick={onPause} className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600">
              暂停
            </button>
          ) : (
            <button onClick={onResume} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
              继续
            </button>
          )}
          <button onClick={onNext} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            下一条
          </button>
          <button onClick={onStop} className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
            停止
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **步骤 2：Commit**

```bash
git add frontend/src/components/AutoPlayBar.jsx
git commit -m "feat: add AutoPlayBar floating control for playlist playback"
```

---

### Task 13: NewsDetail Component

**文件：**
- 创建：`frontend/src/components/NewsDetail.jsx`

- [ ] **步骤 1：实现 `frontend/src/components/NewsDetail.jsx`**

```jsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { api } from '../services/api.js';

const ALLOWED_TAGS = [
  'p', 'br', 'img', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'ul', 'ol', 'li', 'video', 'source', 'iframe', 'div', 'span'
];

const ALLOWED_IFRAME_HOSTS = [
  'player.bilibili.com',
  'v.qq.com',
  'www.youtube.com',
  'www.youku.com'
];

function sanitizeContent(html) {
  if (!html) return '';

  const tmp = document.createElement('div');
  tmp.innerHTML = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['src', 'href', 'title', 'alt', 'width', 'height', 'frameborder', 'allowfullscreen', 'class']
  });

  const iframes = tmp.querySelectorAll('iframe');
  iframes.forEach((iframe) => {
    try {
      const url = new URL(iframe.src);
      if (!ALLOWED_IFRAME_HOSTS.includes(url.hostname)) {
        iframe.remove();
      }
    } catch {
      iframe.remove();
    }
  });

  return tmp.innerHTML;
}

export function NewsDetail({ onPlayFull }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getArticle(id)
      .then(setArticle)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-center">加载中...</div>;
  if (error) return <div className="p-8 text-center text-red-500">错误：{error}</div>;
  if (!article) return <div className="p-8 text-center">文章不存在</div>;

  const hasContent = article.content && article.content.trim().length > 0;
  const sanitizedHtml = sanitizeContent(article.content);

  // Extract plain text for voice playback (strip HTML tags)
  const plainText = hasContent
    ? article.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : article.summary;

  return (
    <div className="max-w-3xl mx-auto p-4">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
      >
        ← 返回列表
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">{article.title}</h1>

      <div className="flex items-center gap-3 text-sm text-gray-500 mb-6">
        <span>{article.sourceName}</span>
        <span>·</span>
        <span>{new Date(article.publishedAt).toLocaleString('zh-CN')}</span>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => onPlayFull(plainText)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          播报全文
        </button>
        <a
          href={article.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
        >
          查看原文
        </a>
      </div>

      {hasContent ? (
        <div
          className="prose max-w-none prose-img:rounded-lg prose-video:w-full"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      ) : (
        <div className="p-8 bg-gray-50 rounded text-center text-gray-500">
          该文章暂无全文内容，请点击"查看原文"阅读完整内容。
        </div>
      )}
    </div>
  );
}
```

- [ ] **步骤 2：Commit**

```bash
git add frontend/src/components/NewsDetail.jsx
git commit -m "feat: add NewsDetail with sanitized HTML, image/video rendering, and voice playback"
```

---

### Task 14: NewsList Page & App Integration

**文件：**
- 创建：`frontend/src/components/NewsList.jsx`
- 创建：`frontend/src/App.jsx`

- [ ] **步骤 1：实现 `frontend/src/components/NewsList.jsx`**

```jsx
import { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api.js';
import { NewsCard } from './NewsCard.jsx';
import { SourceFilter } from './SourceFilter.jsx';

export function NewsList({
  onPlaySingle,
  onPlayAll,
  isAutoPlaying,
  currentPlayingIndex,
  autoPlayTotal
}) {
  const [articles, setArticles] = useState([]);
  const [sources, setSources] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  const fetchArticles = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (selectedSourceId) params.sourceId = selectedSourceId;
      const data = await api.getArticles(params);
      setArticles(data.items);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Failed to fetch articles:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSourceId]);

  useEffect(() => {
    fetchArticles(1);
  }, [fetchArticles]);

  useEffect(() => {
    api.getSources().then(setSources).catch(console.error);
  }, []);

  const handlePlayAll = () => {
    const summaries = articles.map((a) => a.summary || a.title);
    onPlayAll(summaries);
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">新闻头条播报</h1>
        <button
          onClick={handlePlayAll}
          disabled={articles.length === 0 || isAutoPlaying}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition"
        >
          全部播报
        </button>
      </div>

      <SourceFilter
        sources={sources}
        selectedId={selectedSourceId}
        onChange={setSelectedSourceId}
      />

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : articles.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">暂无新闻，请等待首次抓取完成。</p>
          <button
            onClick={() => api.triggerCrawl()}
            className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-800"
          >
            立即触发抓取
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {articles.map((article, index) => (
              <NewsCard
                key={article.id}
                article={article}
                isActive={isAutoPlaying && index === currentPlayingIndex}
                onPlay={onPlaySingle}
              />
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => fetchArticles(p)}
                  className={`px-3 py-1 rounded ${
                    p === pagination.page
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **步骤 2：实现 `frontend/src/App.jsx`**

```jsx
import { Routes, Route } from 'react-router-dom';
import { NewsList } from './components/NewsList.jsx';
import { NewsDetail } from './components/NewsDetail.jsx';
import { AutoPlayBar } from './components/AutoPlayBar.jsx';
import { useSpeech } from './hooks/useSpeech.js';

export default function App() {
  const {
    isSupported,
    isPlaying,
    currentIndex,
    playQueue,
    playSingle,
    pause,
    resume,
    stop,
    next
  } = useSpeech();

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <Routes>
        <Route
          path="/"
          element={
            <NewsList
              onPlaySingle={playSingle}
              onPlayAll={playQueue}
              isAutoPlaying={isPlaying}
              currentPlayingIndex={currentIndex}
              autoPlayTotal={0}
            />
          }
        />
        <Route
          path="/article/:id"
          element={<NewsDetail onPlayFull={playSingle} />}
        />
      </Routes>

      <AutoPlayBar
        isPlaying={isPlaying}
        currentIndex={currentIndex}
        total={isPlaying ? currentIndex + 1 : 0}
        onPause={pause}
        onResume={resume}
        onStop={stop}
        onNext={next}
      />
    </div>
  );
}
```

- [ ] **步骤 3：启动前后端联调验证**

终端1运行：`cd backend && node src/server.js`
终端2运行：`cd frontend && npm run dev`
浏览器打开：`http://localhost:3000`
预期：看到新闻列表页面（首次可能为空，点击"立即触发抓取"或等待爬虫运行）

- [ ] **步骤 4：Commit**

```bash
git add frontend/src/components/NewsList.jsx frontend/src/App.jsx
git commit -m "feat: integrate NewsList, NewsDetail, routing, and auto-playback"
```

---

## 自检

### 1. 规格覆盖度

| 规格需求 | 实现任务 |
|---------|---------|
| RSS定时爬取 | Task 4 (Crawler), Task 5 (Scheduler) |
| 新闻存储 | Task 2 (DB Layer) |
| 新闻列表+分页 | Task 6 (Articles API), Task 14 (NewsList) |
| 来源筛选 | Task 6 (API), Task 11 (SourceFilter), Task 14 (NewsList) |
| 单条播报 | Task 10 (useSpeech), Task 11 (NewsCard) |
| 全部自动播报 | Task 10 (useSpeech), Task 12 (AutoPlayBar), Task 14 (App) |
| 详情查看 | Task 6 (API), Task 13 (NewsDetail) |
| 图片/视频展示 | Task 13 (NewsDetail with DOMPurify + iframe whitelist) |
| HTML安全清理 | Task 13 (sanitizeContent) |
| 手动触发爬取 | Task 6 (crawl route), Task 14 (NewsList empty state) |
| RESTful API + 统一包装 | Task 3 (middleware), Task 6 (routes) |
| 错误处理 | Task 3 (errorHandler), Task 9 (api.js error handling) |
| 扩展性预留 | Task 2 (DB schema), 全API设计 |

**无遗漏。**

### 2. 占位符扫描

- 无 "TODO" / "待定" / "后续实现"
- 无 "添加适当的错误处理" 等模糊描述
- 所有代码步骤包含实际可运行代码
- 所有命令步骤包含精确命令和预期输出

### 3. 类型一致性

- `originalUrl` 在DB schema、API响应、crawler中命名一致
- `sourceId` / `sourceName` 在 model、API、frontend 中一致
- `isActive` 在 DB 和 crawler 查询条件中一致
- `useSpeech` 返回的 `currentIndex` 在 hook、NewsList、AutoPlayBar 中语义一致

**无命名不一致。**

---

## 执行交接

**计划已完成并保存到 `docs/superpowers/plans/2026-06-30-news-broadcasting-system.md`。两种执行方式：**

**1. 子代理驱动（推荐）** — 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** — 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？**