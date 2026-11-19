# 用户互动功能设计文档

## 背景与目标

系统目前提供基础的新闻浏览、分类、语音播报功能，但用户之间以及用户与内容之间缺乏互动机制。本次功能目标：

- **邮箱认证**：注册后验证邮箱，提升账号安全性和可信度
- **密码找回/修改**：完整的账号安全功能
- **点赞功能**：用户可对文章点赞，查看点赞用户列表
- **评论功能**：嵌套评论（一层回复），支持举报和管理员管理
- **热门排行榜**：按点赞数展示今日/本周热门新闻，首页侧边栏 + 独立页面

## 需求澄清

| 问题 | 结论 |
|---|---|
| 邮件发送方式？ | **真实 SMTP 服务**（环境变量配置） |
| 邮箱验证强制性？ | **注册后可登录，但点赞/评论需验证邮箱** |
| 点赞设计？ | **文章点赞 + 点赞用户列表（可查看谁点了赞）** |
| 评论结构？ | **嵌套评论，最多一层回复** |
| 评论审核？ | **无需审核，支持举报，管理员可删除** |
| 热门算法？ | **仅按点赞数排序** |
| 热门时间范围？ | **今日热门 + 本周热门** |
| 排行榜展示？ | **首页侧边栏 TOP 5 + 独立排行榜页面** |

## 方案选择

### 方案 A：最小可行方案

- 邮箱验证基础流程，密码重置 token 存储在内存
- 点赞仅记录关系，无用户列表查看
- 评论扁平列表，无嵌套回复
- 举报达到阈值自动隐藏，无管理界面
- 排行榜仅一个维度

**优点**：实现快，改动小  
**缺点**：功能不完整，管理员无操作界面

### 方案 B：标准完整方案（选定）

- 完整的邮箱验证/密码找回/密码修改流程，token 数据库管理
- 点赞 toggle + 点赞用户列表（分页）
- 嵌套评论（一层回复），软删除保留上下文
- 独立举报表，管理后台可查看举报、删除/恢复评论
- 首页侧边栏 TOP 5 + 独立 `/hot` 页面支持今日/本周切换

**优点**：功能完整，用户体验好，管理员有操作界面  
**缺点**：开发量中等，需新增约 5-6 个数据库表

### 方案 C：分阶段实现

- 第一阶段：邮箱认证 + 密码找回/修改 + 点赞 + 基础评论
- 第二阶段：评论回复 + 举报 + 管理后台 + 排行榜

**优点**：每阶段交付明确，风险低  
**缺点**：总耗时更长，用户体验不连贯

## 架构设计

### 新增/修改的文件

| 文件 | 动作 | 职责 |
|---|---|---|
| `backend/src/db.js` | 修改 | 新增 5 张表：`email_verification_tokens`、`password_reset_tokens`、`article_likes`、`comments`、`comment_reports` |
| `backend/src/models/user.js` | 修改 | 新增 `updateUserPassword`、`setEmailVerified`、`findUserById` 扩展 |
| `backend/src/models/articleLike.js` | 新增 | 点赞 CRUD、点赞数聚合、点赞用户列表 |
| `backend/src/models/comment.js` | 新增 | 评论 CRUD、嵌套查询、软删除、举报管理 |
| `backend/src/models/emailVerification.js` | 新增 | 验证 token 生成/校验/失效 |
| `backend/src/models/passwordReset.js` | 新增 | 重置 token 生成/校验/失效 |
| `backend/src/routes/auth.js` | 修改 | 新增 verify-email、resend-verification、forgot-password、reset-password、change-password 接口 |
| `backend/src/routes/articles.js` | 修改 | 新增 `/hot`、`/hot-sidebar` 接口 |
| `backend/src/routes/likes.js` | 新增 | 点赞 toggle、点赞列表、已点赞状态查询 |
| `backend/src/routes/comments.js` | 新增 | 发表评论、回复、列表查询、删除、举报 |
| `backend/src/middleware/auth.js` | 修改 | 新增 `verifiedEmailMiddleware` |
| `backend/src/services/mailer.js` | 新增 | SMTP 邮件发送封装（验证邮件、重置邮件） |
| `backend/src/app.js` | 修改 | 注册 `/api/articles/:id/likes`、`/api/articles/:id/comments`、`/api/comments` 路由 |
| `frontend/src/App.jsx` | 修改 | 新增 `/forgot-password`、`/reset-password`、`/hot`、`/comment-manager` 路由 |
| `frontend/src/services/api.js` | 修改 | 新增所有新 API 的调用方法 |
| `frontend/src/hooks/useAuth.js` | 修改 | 增加邮箱验证状态、密码修改方法 |
| `frontend/src/components/EmailVerificationBanner.jsx` | 新增 | 未验证用户横幅提示 |
| `frontend/src/components/ForgotPassword.jsx` | 新增 | 密码找回页面 |
| `frontend/src/components/ResetPassword.jsx` | 新增 | 重置密码页面 |
| `frontend/src/components/HotSidebar.jsx` | 新增 | 首页热门侧边栏 |
| `frontend/src/components/HotNews.jsx` | 新增 | 热门排行榜页面 |
| `frontend/src/components/CommentSection.jsx` | 新增 | 评论区域（列表 + 输入 + 回复） |
| `frontend/src/components/LikeButton.jsx` | 新增 | 点赞按钮 + 点赞数 |
| `frontend/src/components/LikeUsersModal.jsx` | 新增 | 点赞用户列表弹窗 |
| `frontend/src/components/CommentManager.jsx` | 新增 | 管理员评论管理页面 |
| `frontend/src/components/NewsCard.jsx` | 修改 | 嵌入点赞按钮 |
| `frontend/src/components/NewsDetail.jsx` | 修改 | 嵌入评论区域和点赞按钮 |
| `frontend/src/components/TtsSettings.jsx` | 修改 | 增加修改密码表单 |
| `frontend/src/components/LoginForm.jsx` | 修改 | 增加"忘记密码？"链接 |

## 数据模型

### 新增 `email_verification_tokens` 表

```sql
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expiresAt DATETIME NOT NULL,
  usedAt DATETIME,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_userId ON email_verification_tokens(userId);
```

### 新增 `password_reset_tokens` 表

```sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expiresAt DATETIME NOT NULL,
  usedAt DATETIME,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
```

### 新增 `article_likes` 表

```sql
CREATE TABLE IF NOT EXISTS article_likes (
  userId INTEGER NOT NULL,
  articleId INTEGER NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (userId, articleId),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (articleId) REFERENCES articles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_article_likes_articleId ON article_likes(articleId);
```

### 新增 `comments` 表

```sql
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  articleId INTEGER NOT NULL,
  userId INTEGER NOT NULL,
  content TEXT NOT NULL,
  parentId INTEGER,
  isDeleted BOOLEAN NOT NULL DEFAULT 0,
  reportCount INTEGER NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (articleId) REFERENCES articles(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parentId) REFERENCES comments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comments_articleId ON comments(articleId);
CREATE INDEX IF NOT EXISTS idx_comments_userId ON comments(userId);
CREATE INDEX IF NOT EXISTS idx_comments_parentId ON comments(parentId);
```

### 新增 `comment_reports` 表

```sql
CREATE TABLE IF NOT EXISTS comment_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commentId INTEGER NOT NULL,
  reporterId INTEGER NOT NULL,
  reason TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (commentId) REFERENCES comments(id) ON DELETE CASCADE,
  FOREIGN KEY (reporterId) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(commentId, reporterId)
);
CREATE INDEX IF NOT EXISTS idx_comment_reports_commentId ON comment_reports(commentId);
```

## 数据流

### 邮箱验证流程

```
用户注册
  │
  ▼
后端生成 verification token（24h 过期）→ 存入 email_verification_tokens
  │
  ▼
发送验证邮件（含 /verify-email?token=xxx 链接）
  │
  ▼
用户点击链接 → 校验 token（未过期、未使用）
  │
  ▼
标记 users.emailVerified = 1，标记 token.usedAt
  │
  ▼
跳转登录页或刷新用户状态
```

### 密码找回流程

```
点击"忘记密码" → 输入邮箱
  │
  ▼
后端生成 reset token（24h 过期）→ 存入 password_reset_tokens
  │
  ▼
发送重置邮件（含 /reset-password?token=xxx 链接）
  │
  ▼
用户设置新密码 → 校验 token → 更新 passwordHash → 标记 token.usedAt
  │
  ▼
跳转登录页
```

### 点赞流程

```
点击点赞按钮
  │
  ▼
检查登录状态（未登录 → 跳转登录）
  │
  ▼
检查邮箱验证状态（未验证 → 提示验证横幅）
  │
  ▼
POST /api/articles/:id/like（toggle）
  │
  ▼
已赞则 DELETE article_likes 记录，未赞则 INSERT
  │
  ▼
返回 {liked: boolean, likeCount: number}
  │
  ▼
前端更新 UI（图标 + 数字）
```

### 评论流程

```
发表评论
  │
  ▼
检查登录 + 邮箱验证
  │
  ▼
POST /api/articles/:id/comments → INSERT comments（parentId = NULL）
  │
  ▼
前端 prepend 新评论到列表

回复评论
  │
  ▼
POST /api/comments/:id/reply → INSERT comments（parentId = 评论ID）
  │
  ▼
前端 append 到对应评论下方

举报评论
  │
  ▼
POST /api/comments/:id/report → INSERT comment_reports
  │
  ▼
UPDATE comments SET reportCount = reportCount + 1
  │
  ▼
前端显示"已举报"
```

### 排行榜流程

```
首页加载
  │
  ▼
并行请求：GET /api/articles（列表）+ GET /api/articles/hot-sidebar?range=today
  │
  ▼
侧边栏渲染 TOP 5

/hot 页面
  │
  ▼
GET /api/articles/hot?range=today\|week&page=1
  │
  ▼
Tab 切换时重新请求对应 range
```

## 接口定义

### POST /api/auth/verify-email

验证邮箱。

**请求体：**
```json
{ "token": "xxx" }
```

**成功响应：**
```json
{
  "code": 0,
  "message": "Email verified successfully",
  "data": null
}
```

**错误响应（token 无效或过期）：**
```json
{
  "code": 1020,
  "message": "Invalid or expired verification token"
}
```

### POST /api/auth/resend-verification

重发验证邮件（需登录）。

**成功响应：**
```json
{
  "code": 0,
  "message": "Verification email sent",
  "data": null
}
```

**错误响应（已验证）：**
```json
{
  "code": 1021,
  "message": "Email already verified"
}
```

### POST /api/auth/forgot-password

请求密码重置邮件。

**请求体：**
```json
{ "email": "user@example.com" }
```

**成功响应（无论邮箱是否存在）：**
```json
{
  "code": 0,
  "message": "If the email is registered, a reset link has been sent",
  "data": null
}
```

### POST /api/auth/reset-password

使用 token 重置密码。

**请求体：**
```json
{
  "token": "xxx",
  "password": "newpassword123"
}
```

**成功响应：**
```json
{
  "code": 0,
  "message": "Password reset successfully",
  "data": null
}
```

**错误响应（token 无效或过期）：**
```json
{
  "code": 1022,
  "message": "Invalid or expired reset token"
}
```

### PUT /api/auth/change-password

修改密码（需登录）。

**请求体：**
```json
{
  "oldPassword": "oldpassword123",
  "newPassword": "newpassword123"
}
```

**错误响应（旧密码错误）：**
```json
{
  "code": 1009,
  "message": "Invalid old password"
}
```

### POST /api/articles/:id/like

点赞/取消点赞（需登录 + 邮箱已验证）。

**成功响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "liked": true,
    "likeCount": 42
  }
}
```

**错误响应（未验证邮箱）：**
```json
{
  "code": 1023,
  "message": "Please verify your email to perform this action"
}
```

### GET /api/articles/:id/likes

获取点赞用户列表（公开）。

**查询参数：** `page`, `limit`

**成功响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "users": [
      { "id": 1, "displayName": "user1@example.com" }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }
  }
}
```

### GET /api/articles/:id/liked

检查当前用户是否点赞（需登录）。

**成功响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": { "liked": true }
}
```

### POST /api/articles/:id/comments

发表评论（需登录 + 邮箱已验证）。

**请求体：**
```json
{ "content": "评论内容" }
```

**成功响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": 1,
    "articleId": 1,
    "userId": 1,
    "content": "评论内容",
    "parentId": null,
    "isDeleted": false,
    "reportCount": 0,
    "createdAt": "2026-11-19T10:00:00Z",
    "user": { "id": 1, "displayName": "user1@example.com" }
  }
}
```

### POST /api/comments/:id/reply

回复评论（需登录 + 邮箱已验证）。

**请求体：**
```json
{ "content": "回复内容" }
```

### GET /api/articles/:id/comments

获取文章评论列表（公开）。

**成功响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "comments": [
      {
        "id": 1,
        "content": "顶层评论",
        "user": { "id": 1, "displayName": "user1" },
        "createdAt": "2026-11-19T10:00:00Z",
        "isDeleted": false,
        "reportCount": 0,
        "replies": [
          {
            "id": 2,
            "content": "回复内容",
            "user": { "id": 2, "displayName": "user2" },
            "createdAt": "2026-11-19T10:05:00Z",
            "isDeleted": false
          }
        ]
      }
    ]
  }
}
```

### DELETE /api/comments/:id

删除评论（管理员，软删除）。

**成功响应：**
```json
{
  "code": 0,
  "message": "Comment deleted",
  "data": null
}
```

### POST /api/comments/:id/report

举报评论（需登录）。

**请求体：**
```json
{ "reason": "spam" }
```

**成功响应：**
```json
{
  "code": 0,
  "message": "Comment reported",
  "data": null
}
```

**错误响应（已举报）：**
```json
{
  "code": 1024,
  "message": "You have already reported this comment"
}
```

### GET /api/articles/hot

获取热门新闻。

**查询参数：**
- `range`: `today` \| `week`（默认 `today`）
- `page`: 页码（默认 1）
- `limit`: 每页数量（默认 20，最大 100）

**成功响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": 1,
        "title": "新闻标题",
        "summary": "摘要",
        "sourceName": "来源",
        "category": "科技",
        "likeCount": 100,
        "publishedAt": "2026-11-19T08:00:00Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 50, "totalPages": 3 }
  }
}
```

### GET /api/articles/hot-sidebar

获取侧边栏热门 TOP 5。

**查询参数：**
- `range`: `today` \| `week`（默认 `today`）

**成功响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      { "id": 1, "title": "新闻标题", "likeCount": 100 }
    ]
  }
}
```

## 错误处理

| 场景 | HTTP Code | 业务 Code | 处理 |
|------|-----------|-----------|------|
| 未登录调用互动功能 | 401 | 1003/1004 | 前端跳转登录页 |
| 未验证邮箱调用点赞/评论 | 403 | 1023 | 前端显示验证横幅，禁止操作 |
| 验证 token 无效/过期 | 400 | 1020 | 前端提示"链接已过期" |
| 重置 token 无效/过期 | 400 | 1022 | 前端提示"链接已过期，请重新申请" |
| 旧密码错误 | 401 | 1009 | 前端提示"旧密码错误" |
| 评论内容为空 | 400 | 1025 | 前端表单校验 |
| 重复举报 | 409 | 1024 | 前端提示"您已举报过该评论" |
| 无权删除评论 | 403 | 1011 | 前端无显示（管理员才有删除按钮） |

## 前端展示

### 邮箱验证横幅

- 未验证用户登录后，Navbar 下方显示黄色横幅
- 文案："请验证您的邮箱以使用点赞、评论等功能。"
- 操作按钮："重新发送验证邮件"
- 验证成功后横幅自动消失

### 登录页

- 密码输入框下方增加"忘记密码？"链接 → 跳转到 `/forgot-password`

### 密码找回页

- 输入邮箱 → 提交后显示成功提示（无论邮箱是否存在）
- 邮件内含 `/reset-password?token=xxx` 链接

### 重置密码页

- 输入新密码 + 确认密码 → 提交 → 成功跳转登录页

### 设置页

- 新增"修改密码"卡片：旧密码、新密码、确认新密码

### 新闻卡片/详情页

- 点赞按钮：空心/实心图标 + 点赞数
- 未登录点击 → 提示登录
- 未验证点击 → 提示验证邮箱
- 点击点赞数 → 弹窗显示点赞用户列表

### 评论区域

- 评论输入框（未登录显示"请登录后评论"）
- 评论列表：用户头像/名称、时间、内容
- 每条评论有"回复"按钮，展开回复输入框
- 回复显示在评论下方（缩进 + 灰色背景）
- 已删除评论显示"该评论已删除"，其回复仍可见
- "举报"按钮：弹出原因选择（垃圾广告、人身攻击、违法违规、其他）

### 管理员评论管理

- 路由 `/comment-manager`（仅管理员可见）
- 被举报评论列表：评论内容、举报人、原因、举报时间
- 操作：删除（软删除）、忽略（清空 reportCount）

### 首页侧边栏

- 新闻列表右侧（桌面端）/ 顶部（移动端）
- 标题"今日热门"，显示 TOP 5
- 每条：标题（截断）+ 点赞数
- 底部"查看完整榜单"→ `/hot`

### 热门排行榜页

- 路由 `/hot`
- Tab 切换：今日热门 / 本周热门
- 列表展示：标题、来源、点赞数、摘要
- 分页加载

## 配置

### 环境变量

| 变量 | 说明 |
|---|---|
| `SMTP_HOST` | SMTP 服务器地址 |
| `SMTP_PORT` | SMTP 端口 |
| `SMTP_USER` | SMTP 用户名 |
| `SMTP_PASS` | SMTP 密码 |
| `SMTP_FROM` | 发件人地址（如 `AI新闻播报 <noreply@example.com>`） |
| `APP_BASE_URL` | 应用基础 URL（用于邮件链接，如 `http://localhost:3000`） |

### SMTP 配置示例（`.env`）

```
SMTP_HOST=smtp.qq.com
SMTP_PORT=587
SMTP_USER=your_email@qq.com
SMTP_PASS=your_auth_code
SMTP_FROM=AI新闻播报 <your_email@qq.com>
APP_BASE_URL=http://localhost:3000
```

## 测试策略

| 类型 | 内容 |
|---|---|
| 单元测试 | token 生成/校验/过期逻辑；点赞 toggle 逻辑；评论嵌套查询 |
| API 测试 | 所有新接口的认证边界（未登录、未验证邮箱、管理员/普通用户权限） |
| 集成测试 | 完整邮箱验证流程、密码找回流程、评论发表-回复-举报-删除流程 |
| 前端测试 | 点赞状态实时更新、评论回复展开/收起、排行榜 Tab 切换、未验证用户限制 |

## 风险与注意事项

1. **SMTP 可靠性**：邮件发送依赖外部 SMTP 服务，需处理发送失败时的用户提示和重试机制
2. **token 安全**：验证/重置 token 使用加密安全的随机字符串，设置合理的过期时间（24小时），单次使用后立即失效
3. **评论内容安全**：评论内容需做基本的 XSS 防护（前端转义展示）
4. **热门榜性能**：初期通过 `COUNT(*)` 实时聚合，如数据量增大需考虑增加 `likeCount` 缓存字段
5. **并发点赞**：SQLite 的 `INSERT OR IGNORE` / `DELETE` 模式天然原子化，无需额外锁
6. **邮件防枚举**：密码找回接口无论邮箱是否存在都返回相同成功消息，防止用户枚举
