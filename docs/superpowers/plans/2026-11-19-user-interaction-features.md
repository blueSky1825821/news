# 用户互动功能收尾与验收计划

依据[用户互动功能设计](../specs/2026-11-19-user-interaction-features-design.md)。仓库已提交账号功能（`c27fbbd`）、互动和榜单后端（`f9021c1`）、后端测试（`2bf29ba`）及前端集成（`59eb47d`）。从现有实现增量修正，按「账号 → 点赞和评论 → 榜单 → 联调」执行。以下复选框表示收尾验收项。

## 现有技术与接口

- 后端使用 Express、`node:sqlite` 的 `DatabaseSync` 和 Nodemailer。五张互动表已在 `backend/src/db.js` 中定义。数据库改动须覆盖已有库升级和重复初始化。
- 前端使用 React、Vite 和 React Router，路由基路径为 `/news`。浏览器邮件链接使用 `/news/verify-email` 和 `/news/reset-password`，组件路由只声明 `/verify-email` 和 `/reset-password`。
- API 沿用 `{ code, message, data }`，保持 `/api` 和 `/news/api` 两种挂载可用。接口表采用 `/api` 前缀。
- 登录和浏览允许未验证用户。点赞、发表评论和回复要求邮箱已验证。举报需要登录。管理接口要求管理员身份。

| 功能 | 接口 | 成功数据或行为 |
| --- | --- | --- |
| 邮箱验证 | `POST /api/auth/verify-email`、`POST /api/auth/resend-verification` | 消费验证链接、发送新链接 |
| 密码 | `POST /api/auth/forgot-password`、`POST /api/auth/reset-password`、`PUT /api/auth/change-password` | 统一提示、重置密码、校验旧密码后修改 |
| 点赞 | `POST /api/articles/:id/likes` | `{ liked, likeCount }` |
| 点赞列表和状态 | `GET /api/articles/:id/likes`、`GET /api/articles/:id/likes/liked` | `{ users, pagination }`、`{ liked }` |
| 评论 | `GET/POST /api/articles/:id/comments`、`POST /api/comments/:id/reply` | 含一层回复的列表、创建的评论或回复 |
| 举报与管理 | `POST /api/comments/:id/report`、`GET /api/comments/reported`、`DELETE /api/comments/:id`、`POST /api/comments/:id/clear-reports` | 提交举报、查看举报、软删除、忽略举报 |
| 热门榜 | `GET /api/articles/hot`、`GET /api/articles/hot-sidebar` | `{ items, pagination }`、`{ items }`（最多 5 项） |

点赞接口采用已挂载的复数路径。开发时同步修正设计示例和测试描述中的旧路径。分页对象沿用 `{ page, limit, total, totalPages }`，默认 `page=1`、`limit=20`，上限 100。

## 1. 打通账号邮件与密码流程

涉及 `backend/src/routes/auth.js`、`backend/src/models/{emailVerification,passwordReset,user}.js`、`backend/src/services/mailer.js`、`backend/.env.example`、`frontend/src/{App.jsx,hooks/useAuth.js}`、前端认证及设置表单。

- [ ] 在 `App.jsx` 注册验证页面。读取邮件 URL 中的 token，调用已有 `api.verifyEmail`。提供验证中、成功、链接无效和可重试的失败状态。成功后清理 URL，已登录时刷新 `/me` 并更新全局用户状态，未登录时提供登录入口。重复渲染期间只提交一次。
- [ ] 保留注册成功和补发入口。SMTP 失败时，注册账号仍可登录，补发界面显示可重试错误。配置示例明确 `APP_BASE_URL` 为公开站点源地址。发送测试核对前缀、实际端口、直接打开邮件链接与刷新页面的行为。自动化测试用可控的邮件替身。
- [ ] 两类 token 保持 24 小时有效。签发原值只用于发送邮件，库内保存摘要，日志不含 token。验证或重置时在同一事务内确认未过期、未使用并完成账号更新。重置先计算密码哈希，再在事务内重新核验，重复或并发提交只成功一次。成功改密后使此前签发的重置链接失效。若迁移会使旧链接失效，发布时给出补发或重新申请入口。
- [ ] 忘记密码对已注册邮箱、未知邮箱和发送失败使用相同的对外响应，覆盖 SMTP 失败和限频行为。修改密码复用现有校验，区分旧密码错误和登录过期，确保前端只在真正失去会话时要求重新登录。
- [ ] 在 `backend/tests/auth.test.js` 验收注册后可登录、验证后即时开放互动、补发失败可恢复、过期或已用链接拒绝、并发重置仅一次成功，以及新旧密码的登录结果。浏览器核对忘记密码、重置、设置页改密和缺失 token 四条路径。

## 2. 补齐点赞、评论与管理

涉及 `backend/src/models/{articleLike,comment}.js`、`backend/src/routes/{likes,comments}.js`、现有互动 API 方法，以及 `NewsList`、`NewsCard`、`NewsDetail`、`LikeButton`、`LikeUsersModal`、`CommentSection`、`CommentManager`。

- [ ] 先校验正整数 ID、有效分页参数及对象存在性，再访问数据库。非法参数返回 400，资源不存在返回 404，未登录返回 401，未验证邮箱返回 403/1023，重复举报返回 409/1024。点赞的读取、切换和计数在同一事务内完成。客户端在写入期间禁用按钮，失败后重新获取状态，避免重放切换请求。
- [ ] 点赞人数打开已有分页弹窗。公开点赞用户与评论作者只返回公开身份字段。优先使用公开昵称，缺失时使用稳定的通用显示名，避免以完整账号邮箱作为公开昵称。列表和详情用写入结果更新状态，切换文章或账号时丢弃过时响应。验收列表加载时的请求数量，按文章列表或详情响应提供计数与当前用户状态，避免每张卡片单独查询。
- [ ] 评论按顶层最新、回复最早排序，同时间用 ID 稳定排序。校验去空白后的内容，按纯文本渲染。允许举报顶层评论与回复，回复入口只针对未删除的顶层评论。软删除后保留讨论结构，公开接口隐藏原文，界面显示删除占位。投稿失败保留草稿。
- [ ] 举报记录和 `reportCount` 在同一事务内维护。管理员列表展示评论、举报人、原因和时间，支持软删除及忽略。忽略时同时清理举报行和计数。前端限制普通用户直达管理页，后端对每次管理请求单独校验权限。
- [ ] 在 `backend/tests/{likes,comments}.test.js` 验收权限矩阵、无效 ID、空内容、重复举报、嵌套层数、软删除保留回复且 API 隐藏原文、忽略后计数一致、公开响应无原始邮箱。浏览器核对点赞弹窗分页、回复、举报和管理员操作失败后的反馈。

## 3. 统一热门榜口径和响应式布局

涉及 `backend/src/routes/articles.js`、`backend/tests/hotArticles.test.js`、`frontend/src/components/{NewsList,HotSidebar,HotNews}.jsx`。

- [ ] 两个榜单端点共用筛选和排序逻辑，静态路由位于 `/:id` 之前。以文章发布时间确定候选集合，以候选文章的当前点赞总数排序，保留零赞文章。采用中国标准时间的今日零点至当前时刻。`week` 沿用当前滚动 7 天窗口，页面标明「近 7 天」。同赞按发布时间降序，再按 ID 降序。
- [ ] 统计总数和分页数据使用相同的候选范围。核对跨日、近 7 天临界、超范围页码、同赞排序和侧栏是否等于同范围完整榜前五。测试以固定时间构造边界数据。
- [ ] 首页桌面端右侧展示 TOP 5，移动端在列表顶部展示，条目包含标题与点赞数。完整榜支持两种范围和加载更多。切换范围时重置分页，处理加载、空数据、失败重试和旧请求覆盖问题。

## 4. 联调与发布验收

- [ ] 运行后端全量测试 `npm --prefix backend test -- --runInBand` 和前端构建 `npm --prefix frontend run build`。后端测试使用隔离 SQLite 数据库，邮件测试使用替身。
- [ ] 在走 `/news` 前缀的部署环境用测试邮箱实际收信。依次验证注册、验证、点赞、评论、回复、举报和管理员处理，再从邮件重置后重新登录。检查生产 SMTP 授权配置、链接落点、普通用户与管理员权限，以及移动端侧栏。
- [ ] 用已有 SQLite 数据副本验证升级，核对原有账号、文章和互动记录。若变更 token 存储，验证旧链接的迁移行为和重新申请路径。记录实际执行的命令、通过结果以及待处理问题，再确认交付。
