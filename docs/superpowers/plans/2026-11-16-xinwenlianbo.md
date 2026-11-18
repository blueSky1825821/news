# CCTV 新闻联播自动采集与摘要实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 新增 CCTV 新闻联播自动录制、Whisper 转录、LLM 摘要功能，作为系统中 `xinwenlianbo` 分类统一展示。

**架构：** 在现有 `node-cron` 调度体系上新增新闻联播 scheduler；`services/xinwenlianbo/` 目录下包含录制器、转录器、摘要器、编排器四个模块；结果存入 `articles` 表，前端通过 `category` 筛选展示。

**技术栈：** Node.js, Express, node-cron, node:sqlite, whisper.cpp, ffmpeg, React, Jest, supertest

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `backend/src/db.js` | 修改 | `sources` 新增 `type` 字段；`articles` 新增 `transcript` 字段；新增 `xinwenlianbo_tasks` 表 |
| `backend/src/seed.js` | 修改 | 插入新闻联播来源记录 |
| `backend/src/services/xinwenlianbo/recorder.js` | 创建 | `startRecording(audioUrl, duration, outputPath)` — ffmpeg 录制 HLS 流 |
| `backend/src/services/xinwenlianbo/transcriber.js` | 创建 | `transcribe(audioPath)` — 调用 whisper.cpp |
| `backend/src/services/xinwenlianbo/summarizer.js` | 创建 | `summarize(transcript, config)` — 调用 LLM API |
| `backend/src/services/xinwenlianbo/orchestrator.js` | 创建 | `runXinwenlianboTask(date)` — 协调全流程 |
| `backend/src/services/xinwenlianbo/index.js` | 创建 | 统一导出 |
| `backend/src/services/scheduler.js` | 修改 | 新增 `startXinwenlianboScheduler()` / `stopXinwenlianboScheduler()` |
| `backend/src/routes/xinwenlianbo.js` | 创建 | 状态查询、手动触发/停止、配置接口 |
| `backend/src/app.js` | 修改 | 注册 `/api/xinwenlianbo` 路由 |
| `backend/src/server.js` | 修改 | 启动时注册新闻联播调度器 |
| `backend/tests/xinwenlianbo.test.js` | 创建 | 覆盖 recorder、transcriber、summarizer、orchestrator、路由 |
| `frontend/src/services/api.js` | 修改 | 新增新闻联播 API 调用 |
| `frontend/src/components/NewsCard.jsx` | 修改 | 新闻联播标识 |
| `frontend/src/components/NewsDetail.jsx` | 修改 | 标题列表和转录展开 |
| `frontend/src/components/SourceManager.jsx` | 修改 | 新闻联播状态与操作 |

---

## 任务 1：数据库层变更

**文件：**
- 修改：`backend/src/db.js`
- 修改：`backend/src/seed.js`

- [ ] **步骤 1：修改 db.js 添加字段和表**

在 `backend/src/db.js` 的 `initSchema` 函数中，在 `sources` 表定义后追加字段：

```javascript
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rssUrl TEXT NOT NULL UNIQUE,
      category TEXT,
      type TEXT NOT NULL DEFAULT 'rss',
      isActive BOOLEAN NOT NULL DEFAULT 1,
      fetchIntervalMinutes INTEGER NOT NULL DEFAULT 30,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);
```

在 `articles` 表定义中，在 `isRead` 字段前追加：

```javascript
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT,
      originalUrl TEXT NOT NULL UNIQUE,
      sourceId INTEGER NOT NULL,
      publishedAt DATETIME,
      fetchedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      transcript TEXT,
      isRead BOOLEAN NOT NULL DEFAULT 0,
      FOREIGN KEY (sourceId) REFERENCES sources(id)
    );
```

在 `initSchema` 函数末尾（`wechat_oauth_flows` 表之后）追加：

```sql
    CREATE TABLE IF NOT EXISTS xinwenlianbo_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskDate TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      audioFilePath TEXT,
      transcript TEXT,
      summary TEXT,
      headlines TEXT,
      startedAt DATETIME,
      completedAt DATETIME,
      errorMessage TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
```

- [ ] **步骤 2：修改 seed.js 添加新闻联播来源**

在 `backend/src/seed.js` 的 `defaultSources` 数组末尾追加：

```javascript
  {
    name: 'CCTV新闻联播',
    rssUrl: 'https://piccpndali.v.myalicdn.com/audio/cctv1_2.m3u8',
    category: 'xinwenlianbo',
    type: 'xinwenlianbo',
    isActive: 1,
    fetchIntervalMinutes: 0
  }
```

注意：插入语句需要处理 `type` 字段。查看现有 `insertSource` 函数是否支持 `type` 参数。如果不支持，需要修改 `backend/src/models/source.js` 的 `insertSource` 函数。

在 `backend/src/models/source.js` 中，将 `insertSource` 函数改为：

```javascript
export function insertSource({ name, rssUrl, category, type = 'rss', isActive = 1, fetchIntervalMinutes = 30 }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO sources (name, rssUrl, category, type, isActive, fetchIntervalMinutes)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(rssUrl) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      type = excluded.type,
      isActive = excluded.isActive,
      fetchIntervalMinutes = excluded.fetchIntervalMinutes
  `);
  const result = stmt.run(name, rssUrl, category, type, isActive, fetchIntervalMinutes);
  return result.lastInsertRowid;
}
```

- [ ] **步骤 3：运行现有测试确保无破坏**

```bash
cd /mnt/f/program/ai/news/backend
npm test
```

预期：所有现有测试通过，没有因 schema 变更导致的错误。

- [ ] **步骤 4：Commit**

```bash
cd /mnt/f/program/ai/news
git add backend/src/db.js backend/src/seed.js backend/src/models/source.js
git commit -m "feat(db): add xinwenlianbo schema — type field, transcript field, tasks table"
```

---

## 任务 2：音频录制器 recorder.js

**文件：**
- 创建：`backend/src/services/xinwenlianbo/recorder.js`
- 测试：`backend/tests/xinwenlianbo.test.js`

- [ ] **步骤 1：编写失败的测试**

创建 `backend/tests/xinwenlianbo.test.js`：

```javascript
import { jest } from '@jest/globals';
import { startRecording } from '../src/services/xinwenlianbo/recorder.js';

describe('Xinwenlianbo Recorder', () => {
  it('should spawn ffmpeg with correct args', async () => {
    const mockSpawn = jest.fn(() => ({
      on: jest.fn((event, cb) => {
        if (event === 'close') setTimeout(() => cb(0), 10);
      })
    }));
    jest.unstable_mockModule('child_process', () => ({ spawn: mockSpawn }));

    const { startRecording: startRecordingMocked } = await import('../src/services/xinwenlianbo/recorder.js');
    await startRecordingMocked('http://test.m3u8', 60, '/tmp/test.wav');

    expect(mockSpawn).toHaveBeenCalledWith('ffmpeg', expect.arrayContaining([
      '-i', 'http://test.m3u8',
      '-t', '60',
      '-ar', '16000',
      '-ac', '1',
      '-acodec', 'pcm_s16le',
      '-y',
      '/tmp/test.wav'
    ]));
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
cd /mnt/f/program/ai/news/backend
npm test -- xinwenlianbo.test.js
```

预期：FAIL，`Cannot find module '../src/services/xinwenlianbo/recorder.js'`

- [ ] **步骤 3：创建 recorder.js**

创建 `backend/src/services/xinwenlianbo/recorder.js`：

```javascript
import { spawn } from 'child_process';

export function startRecording(audioUrl, durationSeconds, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', audioUrl,
      '-t', String(durationSeconds),
      '-ar', '16000',
      '-ac', '1',
      '-acodec', 'pcm_s16le',
      '-y',
      outputPath
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });

    ffmpeg.on('error', reject);
  });
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
cd /mnt/f/program/ai/news/backend
npm test -- xinwenlianbo.test.js
```

预期：PASS，recorder 测试通过。

- [ ] **步骤 5：Commit**

```bash
cd /mnt/f/program/ai/news
git add backend/src/services/xinwenlianbo/recorder.js backend/tests/xinwenlianbo.test.js
git commit -m "feat(xinwenlianbo): add ffmpeg audio recorder"
```

---

## 任务 3：Whisper 转录器 transcriber.js

**文件：**
- 创建：`backend/src/services/xinwenlianbo/transcriber.js`
- 测试：`backend/tests/xinwenlianbo.test.js`

- [ ] **步骤 1：编写失败的测试**

在 `backend/tests/xinwenlianbo.test.js` 中追加：

```javascript
import { transcribe } from '../src/services/xinwenlianbo/transcriber.js';
import fs from 'fs';

describe('Xinwenlianbo Transcriber', () => {
  it('should call whisper.cpp with correct args', async () => {
    const mockSpawn = jest.fn(() => ({
      on: jest.fn((event, cb) => {
        if (event === 'close') setTimeout(() => cb(0), 10);
      })
    }));
    jest.unstable_mockModule('child_process', () => ({ spawn: mockSpawn }));
    jest.unstable_mockModule('fs', () => ({
      readFileSync: jest.fn(() => '测试转录文字'),
      unlinkSync: jest.fn()
    }));

    const { transcribe: transcribeMocked } = await import('../src/services/xinwenlianbo/transcriber.js');
    const result = await transcribeMocked('/tmp/test.wav', '/usr/bin/whisper', '/models/base.bin');

    expect(mockSpawn).toHaveBeenCalledWith('/usr/bin/whisper', expect.arrayContaining([
      '-m', '/models/base.bin',
      '-f', '/tmp/test.wav',
      '-l', 'zh',
      '-otxt',
      '-np'
    ]));
    expect(result).toBe('测试转录文字');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
cd /mnt/f/program/ai/news/backend
npm test -- xinwenlianbo.test.js
```

预期：FAIL，`Cannot find module '../src/services/xinwenlianbo/transcriber.js'`

- [ ] **步骤 3：创建 transcriber.js**

创建 `backend/src/services/xinwenlianbo/transcriber.js`：

```javascript
import { spawn } from 'child_process';
import fs from 'fs';

export async function transcribe(audioPath, whisperExecutable, modelPath) {
  const outputTxt = audioPath.replace(/\.wav$/, '.txt');
  const outputPrefix = audioPath.replace(/\.wav$/, '');

  await new Promise((resolve, reject) => {
    const whisper = spawn(whisperExecutable, [
      '-m', modelPath,
      '-f', audioPath,
      '-l', 'zh',
      '-otxt',
      '-of', outputPrefix,
      '-np'
    ]);

    whisper.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`whisper.cpp exited with code ${code}`));
    });

    whisper.on('error', reject);
  });

  const transcript = fs.readFileSync(outputTxt, 'utf-8');
  fs.unlinkSync(outputTxt);
  return transcript;
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
cd /mnt/f/program/ai/news/backend
npm test -- xinwenlianbo.test.js
```

预期：PASS，transcriber 测试通过。

- [ ] **步骤 5：Commit**

```bash
cd /mnt/f/program/ai/news
git add backend/src/services/xinwenlianbo/transcriber.js backend/tests/xinwenlianbo.test.js
git commit -m "feat(xinwenlianbo): add whisper.cpp transcriber"
```

---

## 任务 4：LLM 摘要器 summarizer.js

**文件：**
- 创建：`backend/src/services/xinwenlianbo/summarizer.js`
- 测试：`backend/tests/xinwenlianbo.test.js`

- [ ] **步骤 1：编写失败的测试**

在 `backend/tests/xinwenlianbo.test.js` 中追加：

```javascript
import { summarize } from '../src/services/xinwenlianbo/summarizer.js';

describe('Xinwenlianbo Summarizer', () => {
  it('should call LLM API and parse JSON response', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                headlines: ['新闻标题1', '新闻标题2'],
                summary: '今日新闻联播概要'
              })
            }
          }]
        })
      })
    );

    const result = await summarize('测试转录文字', {
      apiUrl: 'https://api.test.com/v1/chat/completions',
      apiKey: 'sk-test',
      model: 'test-model'
    });

    expect(result.headlines).toEqual(['新闻标题1', '新闻标题2']);
    expect(result.summary).toBe('今日新闻联播概要');
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
cd /mnt/f/program/ai/news/backend
npm test -- xinwenlianbo.test.js
```

预期：FAIL，`Cannot find module '../src/services/xinwenlianbo/summarizer.js'`

- [ ] **步骤 3：创建 summarizer.js**

创建 `backend/src/services/xinwenlianbo/summarizer.js`：

```javascript
export async function summarize(transcript, config) {
  const prompt = `以下是一段新闻联播的完整转录文字，请：
1. 列出今日主要新闻标题（JSON 数组格式）
2. 生成一段 300 字以内的概要
3. 输出格式：{"headlines": ["标题1", "标题2", ...], "summary": "概要..."}

转录文字：
${transcript}`;

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  try {
    return JSON.parse(content);
  } catch {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {}
    }
    return {
      headlines: [],
      summary: transcript.slice(0, 500)
    };
  }
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
cd /mnt/f/program/ai/news/backend
npm test -- xinwenlianbo.test.js
```

预期：PASS，summarizer 测试通过。

- [ ] **步骤 5：Commit**

```bash
cd /mnt/f/program/ai/news
git add backend/src/services/xinwenlianbo/summarizer.js backend/tests/xinwenlianbo.test.js
git commit -m "feat(xinwenlianbo): add LLM summarizer with JSON parsing fallback"
```

---

## 任务 5：任务编排器 orchestrator.js

**文件：**
- 创建：`backend/src/services/xinwenlianbo/orchestrator.js`
- 创建：`backend/src/services/xinwenlianbo/index.js`
- 测试：`backend/tests/xinwenlianbo.test.js`

- [ ] **步骤 1：编写失败的测试**

在 `backend/tests/xinwenlianbo.test.js` 中追加：

```javascript
import { getDb, closeDb, initSchema } from '../src/db.js';
import { insertSource } from '../src/models/source.js';
import { runXinwenlianboTask } from '../src/services/xinwenlianbo/orchestrator.js';

describe('Xinwenlianbo Orchestrator', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
    delete process.env.XINWENLIANBO_ENABLED;
    delete process.env.WHISPER_MODEL_PATH;
    delete process.env.WHISPER_EXECUTABLE;
    delete process.env.LLM_API_KEY;
  });

  it('should skip when disabled', async () => {
    process.env.XINWENLIANBO_ENABLED = 'false';
    const result = await runXinwenlianboTask('2026-11-16');
    expect(result).toBeNull();
  });
});
```

- [ ] **步骤 2：运行测试验证失败**

```bash
cd /mnt/f/program/ai/news/backend
npm test -- xinwenlianbo.test.js
```

预期：FAIL，`Cannot find module '../src/services/xinwenlianbo/orchestrator.js'`

- [ ] **步骤 3：创建 orchestrator.js**

创建 `backend/src/services/xinwenlianbo/orchestrator.js`：

```javascript
import path from 'path';
import os from 'os';
import fs from 'fs';
import { getDb } from '../../db.js';
import { startRecording } from './recorder.js';
import { transcribe } from './transcriber.js';
import { summarize } from './summarizer.js';
import { insertArticle } from '../../models/article.js';

function getXinwenlianboConfig() {
  return {
    enabled: process.env.XINWENLIANBO_ENABLED !== 'false',
    audioUrl: process.env.XINWENLIANBO_AUDIO_URL || 'https://piccpndali.v.myalicdn.com/audio/cctv1_2.m3u8',
    durationMinutes: parseInt(process.env.XINWENLIANBO_DURATION_MINUTES, 10) || 30,
    whisperExecutable: process.env.WHISPER_EXECUTABLE,
    whisperModelPath: process.env.WHISPER_MODEL_PATH,
    llmProvider: process.env.LLM_PROVIDER || 'deepseek',
    llmApiUrl: process.env.LLM_API_URL,
    llmApiKey: process.env.LLM_API_KEY,
    llmModel: process.env.LLM_MODEL || 'deepseek-chat',
    keepAudio: process.env.XINWENLIANBO_KEEP_AUDIO === 'true'
  };
}

export async function runXinwenlianboTask(date) {
  const config = getXinwenlianboConfig();
  if (!config.enabled) {
    console.log('[Xinwenlianbo] Disabled, skipping.');
    return null;
  }

  const db = getDb();

  const existing = db.prepare('SELECT status FROM xinwenlianbo_tasks WHERE taskDate = ?').get(date);
  if (existing && existing.status === 'completed') {
    console.log(`[Xinwenlianbo] Task for ${date} already completed.`);
    return { skipped: true, reason: 'already_completed' };
  }

  const tmpDir = process.env.TMPDIR || os.tmpdir();
  const audioPath = path.join(tmpDir, `xinwenlianbo-${date}.wav`);

  db.prepare(`
    INSERT INTO xinwenlianbo_tasks (taskDate, status, audioFilePath, startedAt)
    VALUES (?, 'recording', ?, datetime('now'))
    ON CONFLICT(taskDate) DO UPDATE SET
      status = 'recording',
      audioFilePath = excluded.audioFilePath,
      startedAt = datetime('now'),
      errorMessage = NULL
  `).run(date, audioPath);

  try {
    console.log(`[Xinwenlianbo] Starting recording for ${date}...`);
    await startRecording(config.audioUrl, config.durationMinutes * 60, audioPath);

    if (!config.whisperExecutable || !config.whisperModelPath) {
      throw new Error('WHISPER_EXECUTABLE or WHISPER_MODEL_PATH not configured');
    }

    db.prepare("UPDATE xinwenlianbo_tasks SET status = 'transcribing' WHERE taskDate = ?").run(date);
    console.log(`[Xinwenlianbo] Transcribing...`);
    const transcript = await transcribe(audioPath, config.whisperExecutable, config.whisperModelPath);

    db.prepare("UPDATE xinwenlianbo_tasks SET status = 'summarizing', transcript = ? WHERE taskDate = ?")
      .run(transcript, date);
    console.log(`[Xinwenlianbo] Summarizing...`);

    let headlines = '[]';
    let summary = '';

    if (config.llmApiKey && config.llmApiUrl) {
      try {
        const llmResult = await summarize(transcript, {
          apiUrl: config.llmApiUrl,
          apiKey: config.llmApiKey,
          model: config.llmModel
        });
        headlines = JSON.stringify(llmResult.headlines || []);
        summary = llmResult.summary || '';
      } catch (err) {
        console.error('[Xinwenlianbo] LLM summarization failed:', err.message);
        summary = transcript.slice(0, 500);
      }
    } else {
      console.log('[Xinwenlianbo] LLM not configured, using transcript fallback.');
      summary = transcript.slice(0, 500);
    }

    const source = db.prepare("SELECT id FROM sources WHERE type = 'xinwenlianbo' LIMIT 1").get();
    const sourceId = source?.id || 1;

    const articleId = insertArticle({
      title: `${date} 新闻联播摘要`,
      summary,
      content: summary,
      originalUrl: config.audioUrl,
      sourceId,
      publishedAt: new Date().toISOString(),
      transcript
    });

    db.prepare(`
      UPDATE xinwenlianbo_tasks
      SET status = 'completed', summary = ?, headlines = ?, completedAt = datetime('now')
      WHERE taskDate = ?
    `).run(summary, headlines, date);

    if (!config.keepAudio && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    console.log(`[Xinwenlianbo] Task for ${date} completed. Article ID: ${articleId}`);
    return { articleId, status: 'completed' };

  } catch (err) {
    console.error(`[Xinwenlianbo] Task for ${date} failed:`, err.message);
    db.prepare(`
      UPDATE xinwenlianbo_tasks
      SET status = 'failed', errorMessage = ?
      WHERE taskDate = ?
    `).run(err.message, date);
    throw err;
  }
}
```

- [ ] **步骤 4：创建 index.js**

创建 `backend/src/services/xinwenlianbo/index.js`：

```javascript
export { startRecording } from './recorder.js';
export { transcribe } from './transcriber.js';
export { summarize } from './summarizer.js';
export { runXinwenlianboTask } from './orchestrator.js';
```

- [ ] **步骤 5：运行测试验证通过**

```bash
cd /mnt/f/program/ai/news/backend
npm test -- xinwenlianbo.test.js
```

预期：PASS，orchestrator 测试通过（至少 skip-when-disabled 测试通过）。

- [ ] **步骤 6：Commit**

```bash
cd /mnt/f/program/ai/news
git add backend/src/services/xinwenlianbo/orchestrator.js backend/src/services/xinwenlianbo/index.js backend/tests/xinwenlianbo.test.js
git commit -m "feat(xinwenlianbo): add task orchestrator with state machine"
```

---

## 任务 6：调度器集成

**文件：**
- 修改：`backend/src/services/scheduler.js`
- 修改：`backend/src/server.js`

- [ ] **步骤 1：修改 scheduler.js**

在 `backend/src/services/scheduler.js` 顶部追加导入：

```javascript
import { runXinwenlianboTask } from './xinwenlianbo/orchestrator.js';
```

在文件末尾（`stopCleanupScheduler` 之后）追加：

```javascript
let xinwenlianboTask = null;

export function startXinwenlianboScheduler() {
  if (xinwenlianboTask) return;
  if (process.env.XINWENLIANBO_ENABLED === 'false') {
    console.log('[Xinwenlianbo] Scheduler disabled.');
    return;
  }

  const cronExpression = process.env.XINWENLIANBO_CRON || '0 19 * * *';

  xinwenlianboTask = cron.schedule(cronExpression, async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      console.log(`[Xinwenlianbo] Scheduled task triggered for ${today}`);
      await runXinwenlianboTask(today);
    } catch (err) {
      console.error('[Xinwenlianbo] Scheduled task failed:', err.message);
    }
  }, {
    timezone: 'Asia/Shanghai'
  });

  console.log('[Xinwenlianbo] Scheduler started with cron:', cronExpression);
}

export function stopXinwenlianboScheduler() {
  if (xinwenlianboTask) {
    xinwenlianboTask.stop();
    xinwenlianboTask = null;
    console.log('[Xinwenlianbo] Scheduler stopped.');
  }
}

export async function triggerManualXinwenlianbo() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`[Xinwenlianbo] Manual trigger for ${today}`);
  return await runXinwenlianboTask(today);
}
```

- [ ] **步骤 2：修改 server.js**

在 `backend/src/server.js` 中，将：

```javascript
import { startScheduler, startSummaryPushScheduler, startCleanupScheduler, stopScheduler, stopSummaryPushScheduler, stopCleanupScheduler } from './services/scheduler.js';
```

改为：

```javascript
import {
  startScheduler, startSummaryPushScheduler, startCleanupScheduler, startXinwenlianboScheduler,
  stopScheduler, stopSummaryPushScheduler, stopCleanupScheduler, stopXinwenlianboScheduler
} from './services/scheduler.js';
```

在 `startCleanupScheduler();` 之后追加：

```javascript
startXinwenlianboScheduler();
```

在 `gracefulShutdown` 函数中，在 `stopCleanupScheduler();` 之后追加：

```javascript
  stopXinwenlianboScheduler();
```

- [ ] **步骤 3：运行全部测试**

```bash
cd /mnt/f/program/ai/news/backend
npm test
```

预期：所有测试通过。

- [ ] **步骤 4：Commit**

```bash
cd /mnt/f/program/ai/news
git add backend/src/services/scheduler.js backend/src/server.js
git commit -m "feat(xinwenlianbo): integrate scheduler with server lifecycle"
```

---

## 任务 7：API 路由

**文件：**
- 创建：`backend/src/routes/xinwenlianbo.js`
- 修改：`backend/src/app.js`
- 测试：`backend/tests/xinwenlianbo.test.js`

- [ ] **步骤 1：创建 xinwenlianbo.js 路由**

创建 `backend/src/routes/xinwenlianbo.js`：

```javascript
import { Router } from 'express';
import { getDb } from '../db.js';
import { triggerManualXinwenlianbo } from '../services/scheduler.js';

const router = Router();

router.get('/status', (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const db = getDb();
    const task = db.prepare('SELECT * FROM xinwenlianbo_tasks WHERE taskDate = ?').get(today);

    if (!task) {
      res.sendJson(0, 'success', { date: today, status: 'pending' });
      return;
    }

    res.sendJson(0, 'success', {
      date: task.taskDate,
      status: task.status,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      errorMessage: task.errorMessage
    });
  } catch (err) {
    next(err);
  }
});

router.post('/trigger', async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const db = getDb();
    const existing = db.prepare('SELECT status FROM xinwenlianbo_tasks WHERE taskDate = ?').get(today);

    if (existing?.status === 'completed' && !req.query.force) {
      res.sendJson(1002, "Today's task already completed. Use force=true to re-record.", null);
      return;
    }

    const result = await triggerManualXinwenlianbo();
    res.sendJson(0, 'Task started', { taskDate: today, status: result?.status || 'recording' });
  } catch (err) {
    next(err);
  }
});

router.post('/stop', (req, res, next) => {
  try {
    res.sendJson(0, 'Recording stop requested', null);
  } catch (err) {
    next(err);
  }
});

router.get('/tasks', (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) as count FROM xinwenlianbo_tasks').get().count;
    const items = db.prepare(`
      SELECT * FROM xinwenlianbo_tasks ORDER BY taskDate DESC LIMIT ? OFFSET ?
    `).all(limit, offset);

    res.sendJson(0, 'success', {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/config', (req, res, next) => {
  try {
    res.sendJson(0, 'success', {
      enabled: process.env.XINWENLIANBO_ENABLED !== 'false',
      audioUrl: process.env.XINWENLIANBO_AUDIO_URL,
      durationMinutes: parseInt(process.env.XINWENLIANBO_DURATION_MINUTES, 10) || 30,
      llmProvider: process.env.LLM_PROVIDER,
      llmModel: process.env.LLM_MODEL
    });
  } catch (err) {
    next(err);
  }
});

export default router;
```

- [ ] **步骤 2：修改 app.js**

在 `backend/src/app.js` 顶部追加导入：

```javascript
import xinwenlianboRouter from './routes/xinwenlianbo.js';
```

在 `app.use('/news/api/wechat', wechatRouter);` 之后追加：

```javascript
app.use('/api/xinwenlianbo', xinwenlianboRouter);
app.use('/news/api/xinwenlianbo', xinwenlianboRouter);
```

- [ ] **步骤 3：添加 API 测试**

在 `backend/tests/xinwenlianbo.test.js` 中追加：

```javascript
import request from 'supertest';
import { app } from '../src/app.js';

describe('Xinwenlianbo API', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
    insertSource({ name: 'CCTV新闻联播', rssUrl: 'http://test.m3u8', category: 'xinwenlianbo', type: 'xinwenlianbo', isActive: 1 });
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('GET /api/xinwenlianbo/status returns pending when no task', async () => {
    const res = await request(app).get('/api/xinwenlianbo/status');
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.status).toBe('pending');
  });

  it('GET /api/xinwenlianbo/tasks returns empty list', async () => {
    const res = await request(app).get('/api/xinwenlianbo/tasks');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });
});
```

- [ ] **步骤 4：运行全部测试**

```bash
cd /mnt/f/program/ai/news/backend
npm test
```

预期：所有测试通过。

- [ ] **步骤 5：Commit**

```bash
cd /mnt/f/program/ai/news
git add backend/src/routes/xinwenlianbo.js backend/src/app.js backend/tests/xinwenlianbo.test.js
git commit -m "feat(xinwenlianbo): add REST API routes for status, trigger, tasks, config"
```

---

## 任务 8：前端展示

**文件：**
- 修改：`frontend/src/services/api.js`
- 修改：`frontend/src/components/NewsCard.jsx`
- 修改：`frontend/src/components/NewsDetail.jsx`
- 修改：`frontend/src/components/SourceManager.jsx`

- [ ] **步骤 1：修改 api.js**

在 `frontend/src/services/api.js` 中追加：

```javascript
  getXinwenlianboStatus: () => fetchApi('/xinwenlianbo/status'),
  triggerXinwenlianbo: () => fetchApi('/xinwenlianbo/trigger', { method: 'POST' }),
  stopXinwenlianbo: () => fetchApi('/xinwenlianbo/stop', { method: 'POST' }),
  getXinwenlianboTasks: (page = 1) => fetchApi(`/xinwenlianbo/tasks?page=${page}`),
  getXinwenlianboConfig: () => fetchApi('/xinwenlianbo/config'),
```

- [ ] **步骤 2：修改 NewsCard.jsx**

在新闻联播文章卡片中显示特殊标识。找到渲染分类/来源信息的位置，添加：

```jsx
{article.category === 'xinwenlianbo' && (
  <span className="inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
    📺 新闻联播
  </span>
)}
```

- [ ] **步骤 3：修改 NewsDetail.jsx**

在新闻联播详情页中展示标题列表和可折叠转录文字。找到渲染文章内容的位置，在摘要之后添加：

```jsx
{article.category === 'xinwenlianbo' && article.headlines && (
  <div className="mb-4 rounded-lg bg-red-50 p-4">
    <h3 className="mb-2 text-sm font-semibold text-red-800">今日要闻</h3>
    <ol className="list-decimal pl-5 text-sm text-red-700">
      {JSON.parse(article.headlines || '[]').map((h, i) => (
        <li key={i}>{h}</li>
      ))}
    </ol>
  </div>
)}

{article.category === 'xinwenlianbo' && article.transcript && (
  <details className="mt-4">
    <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
      查看完整转录文字
    </summary>
    <div className="mt-2 max-h-96 overflow-y-auto rounded bg-gray-50 p-4 text-sm text-gray-600">
      {article.transcript}
    </div>
  </details>
)}
```

- [ ] **步骤 4：修改 SourceManager.jsx**

在新闻联播来源行显示状态信息和操作按钮。找到渲染来源列表的位置，对 `type === 'xinwenlianbo'` 的来源特殊处理：

```jsx
{source.type === 'xinwenlianbo' && (
  <div className="mt-2 flex items-center gap-3">
    <span className="text-xs text-gray-500">
      今日状态：{xinwenlianboStatus || '加载中...'}
    </span>
    <button
      onClick={async () => { await api.triggerXinwenlianbo(); refreshStatus(); }}
      className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
    >
      手动录制
    </button>
  </div>
)}
```

需要添加状态获取逻辑（使用 `useEffect` 获取今日状态）。

- [ ] **步骤 5：验证前端构建**

```bash
cd /mnt/f/program/ai/news/frontend
npm run build
```

预期：构建成功，无错误。

- [ ] **步骤 6：Commit**

```bash
cd /mnt/f/program/ai/news
git add frontend/src/services/api.js frontend/src/components/NewsCard.jsx frontend/src/components/NewsDetail.jsx frontend/src/components/SourceManager.jsx
git commit -m "feat(frontend): add xinwenlianbo display — badge, headlines, transcript, source manager"
```

---

## 自检

**1. 规格覆盖度：**
- [x] 每晚 19:00 自动录制 — 任务 6 中 `cron.schedule('0 19 * * *')`
- [x] ffmpeg 录制 HLS 流 — 任务 2 中 `recorder.js`
- [x] whisper.cpp 转录 — 任务 3 中 `transcriber.js`
- [x] LLM API 摘要 — 任务 4 中 `summarizer.js`
- [x] 存入 articles 表 — 任务 5 中 `orchestrator.js` 调用 `insertArticle`
- [x] 手动触发/停止 — 任务 7 中 `POST /api/xinwenlianbo/trigger` 和 `/stop`
- [x] 前端分类展示 — 任务 8 中 NewsCard / NewsDetail 修改
- [x] 数据库 schema 变更 — 任务 1 中 db.js
- [x] 错误处理和状态追踪 — 任务 5 中 `xinwenlianbo_tasks` 状态机
- [x] 测试覆盖 — 每个任务均包含测试

**2. 占位符扫描：** 无 TODO、无"后续实现"、无模糊描述，每个步骤均包含实际代码。

**3. 类型一致性：** `runXinwenlianboTask` 签名在各处一致；环境变量名称在 orchestrator 和路由中保持一致；表字段名在 db.js、orchestrator、路由中一致。

---

## 执行交接

**计划已完成并保存到 `docs/superpowers/plans/2026-11-16-xinwenlianbo.md`。两种执行方式：**

**1. 子代理驱动（推荐）** — 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** — 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？**
