# 新闻头条播报系统

一个前后端分离的个人新闻播报应用。系统定时从中文新闻 RSS 源抓取头条，存入本地数据库，并通过 Web 界面展示；支持单条摘要语音播报、全部播报自动轮播，以及详情页查看。

---

## 功能特性

- **RSS 定时抓取**：按每个来源配置的间隔自动抓取（最快 10 分钟），支持失败隔离与重试。
- **自动摘要提取**：RSS 无摘要时，自动从正文提取关键句子作为摘要。
- **内容质量过滤**：自动跳过标题过短、正文过短，以及与最近 7 天内已有新闻标题高度重复的文章。
- **自动健康管理**：来源连续失败达到阈值后自动停用，避免日志刷屏；提供 CLI、API 和前端页面手动重新激活或删除。
- **新闻列表**：卡片式展示，带分页、来源筛选与相对发布时间。
- **语音播报**：基于浏览器 Web Speech API，无需后端参与或额外费用。
  - 单条播报：可选择朗读摘要或全文。
  - 全部播报：按默认模式顺序自动播放，支持暂停、继续、下一条、停止。
  - 播报前自动加上来源与发布时间，语速、音调可在设置中调整。
  - 播报完成后自动标记文章已读。
- **播报设置**：前端 `/settings` 页面可配置语速、音调、默认播报模式（摘要/全文）。
- **来源健康管理**：前端 `/sources` 页面可查看各 RSS 源状态、连续失败次数，手动重新激活或删除来源，并可配置自动停用阈值。
- **详情查看**：展示经安全过滤的完整 HTML 内容（支持图片、视频、iframe 嵌入）。
- **手动触发**：提供 `POST /api/crawl/trigger` 端点，可立即触发一次抓取。
- **去重存储**：以原文链接为唯一键，重复文章自动忽略。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端运行时 | Node.js 20+ |
| 后端框架 | Express.js 4 |
| 数据库 | SQLite 3（文件存储） |
| 数据库驱动 | `node:sqlite` (Node.js 内置) |
| RSS 解析 | `rss-parser` |
| 定时任务 | `node-cron` |
| 测试 | Jest + Supertest |
| 前端框架 | React 18 |
| 构建工具 | Vite 5 |
| 样式 | Tailwind CSS 3 |
| 语音合成 | Web Speech API (`speechSynthesis`) |
| HTML 消毒 | DOMPurify |

---

## 项目结构

```
.
├── backend/                  # Node.js + Express 后端
│   ├── src/
│   │   ├── db.js             # SQLite 连接与表结构初始化
│   │   ├── models/           # 数据访问层
│   │   │   ├── source.js
│   │   │   ├── article.js
│   │   │   ├── sourceHealth.js
│   │   │   └── settings.js
│   │   ├── services/         # 业务逻辑
│   │   │   ├── crawler.js    # RSS 抓取与解析
│   │   │   ├── scheduler.js  # 定时任务调度
│   │   │   └── summarizer.js # 摘要提取
│   │   ├── middleware/       # 响应包装、错误处理
│   │   ├── routes/           # REST 路由
│   │   ├── app.js            # Express 应用配置
│   │   ├── server.js         # 服务启动入口
│   │   └── seed.js           # 初始化 RSS 源
│   ├── scripts/              # 运维脚本
│   │   └── sourceHealth.js   # 来源健康状态查看与重新激活
│   └── tests/                # Jest 测试
├── frontend/                 # React + Vite 前端
│   ├── src/
│   │   ├── components/       # UI 组件（NewsList、NewsDetail、SourceManager、TtsSettings 等）
│   │   ├── hooks/            # useSpeech、useTtsSettings 等 Hooks
│   │   ├── services/         # API 客户端
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── vite.config.js
│   └── tailwind.config.js
├── data/                     # SQLite 数据库文件（运行时生成）
└── docs/                     # 设计规格与实现计划
```

---

## 快速开始

### 环境要求

- Node.js >= 20
- npm

### 方式一：一键启动（推荐）

项目提供跨平台一键脚本，自动识别 Windows / Linux / macOS：

```bash
# 开发模式（同时启动前后端）
npm run dev

# 生产部署（构建前端 + 启动服务，前后端合一）
npm run deploy
```

- 开发模式：前端 `http://localhost:3000`，后端 `http://localhost:3001`
- 生产模式：`http://localhost:3000`（前端静态文件 + API 同端口）

### 方式二：手动启动

```bash
# 安装依赖
cd backend && npm install
cd ../frontend && npm install

# 启动后端（端口 3001）
cd backend
npm run dev

# 另开一个终端启动前端（端口 3000）
cd frontend
npm run dev
```

### 首次启动

首次启动时会自动：
- 初始化 SQLite 数据库（`data/news.db`）
- 写入默认 RSS 源（中国新闻网、IT之家、少数派、雷锋网等已验证可用源）
- 启动定时调度，按各来源的 `fetchIntervalMinutes` 分别触发抓取

打开浏览器访问 <http://localhost:3000> 即可使用。

> 首次运行数据库为空，可点击"立即触发抓取"或等待几分钟后刷新页面。

---

## 部署

### 一键部署

```bash
# 项目根目录
npm run deploy
```

执行流程：
1. 安装并构建前端（输出到 `frontend/dist`）
2. 安装后端生产依赖
3. 启动后端服务（默认端口 3000）

后端会自动将 `frontend/dist` 作为静态文件提供服务，并支持前端路由 fallback。访问 `http://localhost:3000` 即可使用。

### 外网访问

部署后，服务默认监听 `0.0.0.0`，同一局域网内的其他设备可通过本机 IP 访问：

```bash
# 查看本机 IP
# Windows: ipconfig
# Linux/macOS: ipconfig 或 hostname -I

# 他人通过浏览器访问
http://<你的IP>:3000
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | 3000 |
| `HOST` | 监听地址 | `0.0.0.0`（所有网卡） |
| `DB_PATH` | SQLite 数据库路径 | `data/news.db` |
| `NODE_ENV` | 运行环境 | — |

### 手动部署

```bash
# 1. 构建前端
cd frontend
npm install
npm run build

# 2. 安装后端依赖并启动
cd ../backend
npm install --production
node src/server.js
```

## 开发命令

### 根目录

```bash
npm run dev        # 一键启动开发模式（前后端）
npm run deploy     # 一键部署生产模式
npm run build      # 仅构建前端
npm run test       # 运行后端测试
```

### 后端

```bash
cd backend
npm run dev        # 启动服务（端口 3001）
npm test           # 运行全部测试
npm run test:watch # 监听模式运行测试
```

### 前端

```bash
cd frontend
npm run dev        # 启动开发服务器（端口 3000）
npm run build      # 生产构建
npm run preview    # 预览生产构建
```

---

## API 说明

所有响应均采用统一格式：

```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/articles` | 分页获取文章列表，支持 `page`、`limit`、`sourceId`、`category` 查询参数 |
| GET | `/api/articles/:id` | 获取单篇文章详情 |
| GET | `/api/sources` | 获取全部已配置来源 |
| GET | `/api/sources/health` | 获取所有来源的健康状态（连续失败次数、最后错误） |
| POST | `/api/sources/:id/activate` | 重新激活一个被自动停用的来源 |
| DELETE | `/api/sources/:id` | 删除指定来源及其历史文章 |
| GET | `/api/settings/failure-threshold` | 获取自动停用阈值 |
| PUT | `/api/settings/failure-threshold` | 设置自动停用阈值 |
| POST | `/api/crawl/trigger` | 手动触发一次 RSS 抓取 |

详细 API 设计与响应示例见 `docs/superpowers/specs/2026-06-30-news-broadcasting-design.md`。

---

## 默认 RSS 源

以下源均已验证可解析且包含较新的内容（测试时间 2026-08-01）：

| 来源名称 | 分类 | 抓取间隔 |
|----------|------|----------|
| 中国新闻网-滚动新闻 | general | 10 分钟 |
| 中国新闻网-财经 | business | 10 分钟 |
| IT之家 | tech | 10 分钟 |
| 36氪-最新 | tech | 10 分钟 |
| 少数派 | tech | 15 分钟 |
| 雷锋网 | tech | 15 分钟 |
| Solidot | tech | 15 分钟 |
| 爱范儿 | tech | 15 分钟 |
| 小众软件 | tech | 15 分钟 |

可在 `backend/src/seed.js` 中修改或新增初始源；来源数据持久化在数据库 `sources` 表中。每个来源的 `fetchIntervalMinutes` 字段控制独立抓取间隔，调度器每 5 分钟检查一次哪些来源到期。

> 注意：RSS 地址可能随网站策略变化而失效。若某个来源长期抓取失败或内容严重滞后，系统会自动将其停用（连续失败 5 次），无需手动删除；你也可通过下方命令重新激活或管理来源。

---

## 来源健康管理

### 自动停用

爬虫每次抓取后会记录该来源的成功/失败状态：
- 成功：连续失败计数清零
- 失败：连续失败计数 +1
- 当连续失败达到设定阈值时，自动将 `sources.isActive` 设为 `0`

默认阈值为 **5 次**，可通过以下方式调整：

1. **前端页面（推荐）**：打开 `/sources`，在“自动停用阈值”输入框中修改并保存。
2. **环境变量**：
   ```bash
   set FAILURE_THRESHOLD=3
   cd backend && npm run dev
   ```

### 前端管理页面

访问 `http://localhost:3000/sources` 可：
- 查看所有来源的健康状态、连续失败次数、最后错误
- 重新激活单个或全部已停用来源
- 删除来源（会同时删除该来源下的历史文章）
- 配置自动停用阈值

### 查看与重新激活（CLI）

```bash
cd backend

# 查看所有来源健康状态
node scripts/sourceHealth.js list

# 重新激活指定 ID 的来源
node scripts/sourceHealth.js activate 3

# 重新激活所有已停用来源
node scripts/sourceHealth.js activate-all
```

### 通过 API 管理

```bash
# 查看健康（开发模式用 3001，生产模式用 3000）
curl http://localhost:3000/api/sources/health

# 重新激活
curl -X POST http://localhost:3000/api/sources/3/activate

# 删除来源
curl -X DELETE http://localhost:3000/api/sources/3

# 查看/设置阈值
curl http://localhost:3000/api/settings/failure-threshold
curl -X PUT http://localhost:3000/api/settings/failure-threshold -H "Content-Type: application/json" -d "{\"threshold\":3}"
```

---

## 扩展性

- **多客户端**：REST API 与前端解耦，后续可直接为小程序、移动 App 提供相同接口。
- **多用户**：当前为单用户 MVP；API 无状态设计，后续添加 JWT 鉴权与 `users` 表即可扩展，无需重写业务逻辑。
- **自定义订阅**：来源存储于数据库而非硬编码，未来可通过 UI 或接口动态增删 RSS 订阅。
- **数据库迁移**：当前使用 SQLite，后续可平滑迁移至 PostgreSQL/MySQL。

---

## 设计文档

- `docs/superpowers/specs/2026-06-30-news-broadcasting-design.md` — 设计规格
- `docs/superpowers/plans/2026-06-30-news-broadcasting-system.md` — 实现计划

---

## 许可证

MIT
