# CCTV 新闻联播自动采集与摘要设计文档

## 背景与目标

系统目前通过 RSS 抓取各类新闻源，但缺少对 CCTV《新闻联播》这一权威新闻节目的覆盖。新闻联播每晚 19:00 播出，包含当日最重要的时政要闻，是高质量的新闻来源。

本功能目标：

- **每晚 19:00 自动录制** CCTV 新闻联播实时音频流
- **本地 Whisper 转录**为完整文字
- **调用大模型 API**生成新闻标题列表和概要
- **存入系统文章库**，作为 `xinwenlianbo` 分类统一展示
- 支持**管理员手动触发/停止**

## 需求澄清

| 问题 | 结论 |
|---|---|
| 音频转文字方案？ | **whisper.cpp 量化版**（本地运行，无 API 费用） |
| 新闻摘要方案？ | **多厂商云端大模型 API**（DeepSeek / 通义 / 智谱等，通过配置切换） |
| 前端展示方式？ | **作为现有新闻列表的一个分类**（`category = 'xinwenlianbo'`），和普通 RSS 新闻混合展示 |
| 存储内容？ | **完整转录文字 + AI 摘要**，原始音频处理完后删除 |
| 触发方式？ | **全自动（每天 19:00）+ 手动触发/停止** 双模式 |
| 错过录制时补录？ | **跳过等今天**，不补录历史 |

## 方案选择

### 方案 A：集成式（选定）

将新闻联播视为系统中的**一个特殊来源**：

- 在 `sources` 表中新增一条 `type = 'xinwenlianbo'` 的记录
- 复用现有的 `articles` 表存储结果，新增 `transcript` 字段
- 调度器统一管理，和 RSS 爬取调度并行
- 前端通过 `category` 筛选展示，无需新页面

**优点**：复用现有架构，代码最少，维护简单  
**缺点**：新闻联播处理逻辑和 RSS 爬取混在一起，边界稍模糊

### 方案 B：独立模块式

独立出完整的新闻联播子系统：

- 新增独立表 `xinwenlianbo_records`
- 新增独立路由 `/api/xinwenlianbo/*`
- 新增独立前端页面 `/xinwenlianbo`

**优点**：边界清晰，完全独立  
**缺点**：代码量大，和现有文章体系割裂

### 方案 C：外部脚本式

写独立的 Node.js 脚本，不集成到 Express：

- 通过 `node-cron` 独立运行，直接操作 SQLite
- 没有 HTTP API，没有前端界面

**优点**：不改动现有服务代码  
**缺点**：无法手动控制，和系统完全隔离

## 架构设计

### 新增/修改的文件

| 文件 | 动作 | 职责 |
|---|---|---|
| `backend/src/db.js` | 修改 | `sources` 表新增 `type` 字段；`articles` 表新增 `transcript` 字段；新增 `xinwenlianbo_tasks` 表 |
| `backend/src/seed.js` | 修改 | 初始化时插入新闻联播来源记录 |
| `backend/src/services/xinwenlianbo/recorder.js` | 新增 | `startRecording(audioUrl, duration, outputPath)` — ffmpeg 录制 HLS 流 |
| `backend/src/services/xinwenlianbo/transcriber.js` | 新增 | `transcribe(audioPath)` — 调用 whisper.cpp 转录 |
| `backend/src/services/xinwenlianbo/summarizer.js` | 新增 | `summarize(transcript, config)` — 调用 LLM API 生成摘要 |
| `backend/src/services/xinwenlianbo/orchestrator.js` | 新增 | `runXinwenlianboTask(date)` — 协调录制→转录→摘要→保存全流程 |
| `backend/src/services/xinwenlianbo/index.js` | 新增 | 统一导出服务模块 |
| `backend/src/services/scheduler.js` | 修改 | 新增 `startXinwenlianboScheduler()` / `stopXinwenlianboScheduler()` |
| `backend/src/routes/xinwenlianbo.js` | 新增 | 状态查询、手动触发/停止、配置读写接口 |
| `backend/src/app.js` | 修改 | 注册 `/api/xinwenlianbo` 路由 |
| `backend/src/server.js` | 修改 | 启动时注册新闻联播调度器 |
| `frontend/src/components/NewsCard.jsx` | 修改 | 新闻联播文章显示特殊标识（📺） |
| `frontend/src/components/NewsDetail.jsx` | 修改 | 新闻联播详情页展示标题列表和可折叠的转录文字 |
| `frontend/src/components/SourceManager.jsx` | 修改 | 新闻联播来源显示特殊标识和管理操作 |
| `frontend/src/services/api.js` | 修改 | 新增新闻联播相关 API 调用 |

## 数据模型

### `sources` 表扩展

```sql
ALTER TABLE sources ADD COLUMN type TEXT NOT NULL DEFAULT 'rss';
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type);
```

**新闻联播来源初始数据：**

| id | name | rssUrl | category | type | isActive | fetchIntervalMinutes |
|---|---|---|---|---|---|---|
| auto | CCTV新闻联播 | `https://piccpndali.v.myalicdn.com/audio/cctv1_2.m3u8` | xinwenlianbo | xinwenlianbo | 1 | 0 |

- `rssUrl` 复用存储音频流地址
- `fetchIntervalMinutes = 0` 表示不走普通 RSS 调度

### `articles` 表扩展

```sql
ALTER TABLE articles ADD COLUMN transcript TEXT;
```

**新闻联播文章数据示例：**

| 字段 | 示例值 |
|---|---|
| title | "2026-11-16 新闻联播摘要" |
| summary | "1. 习近平出席... 2. 国务院印发..." |
| content | "今日新闻联播主要内容如下：..." |
| transcript | "主持人：晚上好，今天是11月16日..." |
| originalUrl | 音频流地址 |
| sourceId | xinwenlianbo 来源 ID |
| category | xinwenlianbo（通过 sources.category JOIN 获得） |

### 新增 `xinwenlianbo_tasks` 表

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

**状态流转：** `pending` → `recording` → `transcribing` → `summarizing` → `completed` / `failed`

## 数据流

### 自动录制流程（每天 19:00）

```
调度器 cron '0 19 * * *'
    │
    ▼
创建 xinwenlianbo_tasks 记录（status = 'recording'）
    │
    ▼
ffmpeg 录制 HLS 流 → WAV 文件（30 分钟，16kHz 单声道）
    │
    ▼
更新 status = 'transcribing'
    │
    ▼
whisper.cpp 转录 WAV → 完整文字
    │
    ▼
更新 status = 'summarizing'
    │
    ▼
LLM API 生成摘要 + 标题列表
    │
    ▼
保存到 articles 表（title / summary / content / transcript）
    │
    ▼
更新 status = 'completed'
    │
    ▼
删除临时音频文件
```

### 手动触发流程

管理员点击"手动录制"按钮 → `POST /api/xinwenlianbo/trigger` → 立即执行上述流程（跳过调度器）。

## 接口定义

### GET /api/xinwenlianbo/status

获取今日任务状态。

**成功响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "date": "2026-11-16",
    "status": "completed",
    "startedAt": "2026-11-16T19:00:00+08:00",
    "completedAt": "2026-11-16T19:45:00+08:00"
  }
}
```

### POST /api/xinwenlianbo/trigger

手动触发今日录制任务。

**成功响应：**
```json
{
  "code": 0,
  "message": "Task started",
  "data": {
    "taskDate": "2026-11-16",
    "status": "recording"
  }
}
```

**错误响应（今日已完成）：**
```json
{
  "code": 1002,
  "message": "Today's task already completed. Use force=true to re-record."
}
```

### POST /api/xinwenlianbo/stop

停止当前进行中的录制。

**成功响应：**
```json
{
  "code": 0,
  "message": "Recording stopped",
  "data": {
    "taskDate": "2026-11-16",
    "status": "failed"
  }
}
```

### GET /api/xinwenlianbo/tasks

获取历史任务列表（管理员，支持分页）。

### GET /api/xinwenlianbo/config

获取当前配置。

### PUT /api/xinwenlianbo/config

更新配置（管理员）。

## 错误处理

| 阶段 | 错误场景 | 处理方式 |
|---|---|---|
| 录制 | ffmpeg 无法连接音频流 | 重试 3 次（间隔 30 秒），仍失败则标记 `failed` |
| 录制 | 磁盘空间不足（< 500MB） | 录制前检查，不足则直接报错 |
| 转录 | whisper.cpp 崩溃/返回空 | 标记 `failed`，根据配置决定是否保留音频文件 |
| 摘要 | LLM API 超时/失败 | 重试 2 次（指数退避），仍失败则保存转录文字但 summary 为空 |
| 摘要 | LLM 返回格式不合法 | 尝试正则提取 JSON，失败则使用转录前 500 字作为 summary fallback |
| 全流程 | 意外中断（进程崩溃） | 启动时扫描 `status != 'completed' AND status != 'failed'` 的任务，标记为 `failed` |

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `XINWENLIANBO_ENABLED` | `true` | 总开关。`false` 时不注册定时任务 |
| `XINWENLIANBO_AUDIO_URL` | `https://piccpndali.v.myalicdn.com/audio/cctv1_2.m3u8` | 音频流地址 |
| `XINWENLIANBO_START_TIME` | `19:00` | 录制开始时间 |
| `XINWENLIANBO_DURATION_MINUTES` | `30` | 录制时长 |
| `WHISPER_MODEL_PATH` | — | whisper.cpp 模型文件路径（如 `ggml-base-q5_1.bin`） |
| `WHISPER_EXECUTABLE` | — | whisper.cpp 可执行文件路径 |
| `LLM_PROVIDER` | `deepseek` | 大模型提供商：`deepseek` / `openai` / `dashscope` / `zhipu` |
| `LLM_API_KEY` | — | API 密钥 |
| `LLM_API_URL` | — | API 端点地址 |
| `LLM_MODEL` | `deepseek-chat` | 模型名称 |
| `XINWENLIANBO_KEEP_AUDIO` | `false` | 完成后是否保留临时音频文件 |

## 部署依赖

### 1. ffmpeg

通常系统自带，或安装：
```bash
apt install ffmpeg  # Debian/Ubuntu
```

### 2. whisper.cpp

```bash
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
cmake -B build
cmake --build build --config Release
# 下载量化模型（约 75MB）
bash models/download-ggml-model.sh base-q5_1
```

### 3. Node.js 依赖

无新增 npm 依赖。音频录制使用 Node.js 内置的 `child_process.spawn` 直接调用 ffmpeg，保持轻量。

## 前端展示

### 新闻列表

- 分类筛选器新增"新闻联播"选项
- 新闻联播文章卡片显示 📺 红色标识
- 标题格式：`YYYY-MM-DD 新闻联播摘要`

### 新闻详情

- 顶部显示 AI 生成的新闻标题列表（`headlines` JSON 解析后渲染）
- 摘要区域正常展示
- 底部增加"查看完整转录"折叠区域，点击展开显示 `transcript` 内容

### 来源管理

- 新闻联播来源显示特殊图标/标识
- 显示今日任务状态（录制中/转录中/已完成/失败）
- 提供"手动触发"和"停止"按钮

## 测试策略

| 类型 | 内容 |
|---|---|
| 单元测试 | `recorder.js`：mock ffmpeg 进程；`transcriber.js`：mock whisper.cpp；`summarizer.js`：mock fetch |
| 集成测试 | 使用短音频样本（1-2 分钟）测试完整流程：录制→转录→摘要→入库 |
| 边界测试 | 磁盘空间不足、LLM 返回非法 JSON、whisper.cpp 崩溃等异常路径 |
| 调度测试 | 验证 cron 表达式正确性、手动触发与自动调度互斥 |

## 风险与注意事项

1. **音频流稳定性**：`cctv1_2.m3u8` 地址可能变更，需监控并支持通过配置更新
2. **whisper.cpp 性能**：量化模型（base-q5_1）在普通 CPU 上处理 30 分钟音频约需 5-10 分钟，首次部署需验证服务器性能
3. **LLM API 成本**：每天一次调用，费用极低，但需确保 API Key 有效
4. **时区敏感**：cron 使用 `Asia/Shanghai`，确保 19:00 触发符合北京时间
5. **磁盘空间**：30 分钟 WAV 文件约 180MB，处理完后自动删除，但需确保处理期间磁盘有足够空间
6. **并发安全**：手动触发和自动调度需互斥，防止同时录制两份
