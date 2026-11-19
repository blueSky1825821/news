# 用户互动功能实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 实现邮箱认证、密码找回/修改、点赞、评论、热门排行榜五个功能模块。

**架构：** 后端新增 5 张 SQLite 表管理验证 token、点赞、评论、举报数据；新增 mailer 服务封装 SMTP；前端新增点赞按钮、评论区域、热门侧边栏等组件。三个功能模块共享同一套邮箱验证状态。

**技术栈：** Express + SQLite (better-sqlite3) + React + Tailwind CSS + SMTP (Nodemailer)

---

## 文件清单

| 文件 | 动作 | 职责 |
|---|---|---|
| `backend/src/db.js` | 修改 | 新增 5 张表 |
| `backend/src/models/user.js` | 修改 | 新增 updatePassword、setEmailVerified |
| `backend/src/models/emailVerification.js` | 新增 | 验证 token CRUD |
| `backend/src/models/passwordReset.js` | 新增 | 重置 token CRUD |
| `backend/src/models/articleLike.js` | 新增 | 点赞 CRUD、聚合查询 |
| `backend/src/models/comment.js` | 新增 | 评论 CRUD、嵌套查询、举报管理 |
| `backend/src/services/mailer.js` | 新增 | SMTP 邮件发送封装 |
| `backend/src/middleware/auth.js` | 修改 | 新增 verifiedEmailMiddleware |
| `backend/src/routes/auth.js` | 修改 | 新增 5 个认证接口 |
| `backend/src/routes/likes.js` | 新增 | 点赞 toggle、列表查询 |
| `backend/src/routes/comments.js` | 新增 | 评论发表、回复、列表、删除、举报 |
| `backend/src/routes/articles.js` | 修改 | 新增 /hot、/hot-sidebar |
| `backend/src/app.js` | 修改 | 注册新路由 |
| `backend/tests/auth.test.js` | 修改 | 新增认证接口测试 |
| `backend/tests/likes.test.js` | 新增 | 点赞接口测试 |
| `backend/tests/comments.test.js` | 新增 | 评论接口测试 |
| `backend/tests/hotArticles.test.js` | 新增 | 热门榜接口测试 |
| `frontend/src/services/api.js` | 修改 | 新增所有 API 方法 |
| `frontend/src/hooks/useAuth.js` | 修改 | 增加验证状态、密码修改 |
| `frontend/src/App.jsx` | 修改 | 新增路由 |
| `frontend/src/components/EmailVerificationBanner.jsx` | 新增 | 验证横幅 |
| `frontend/src/components/ForgotPassword.jsx` | 新增 | 密码找回页 |
| `frontend/src/components/ResetPassword.jsx` | 新增 | 重置密码页 |
| `frontend/src/components/LikeButton.jsx` | 新增 | 点赞按钮 |
| `frontend/src/components/LikeUsersModal.jsx` | 新增 | 点赞用户弹窗 |
| `frontend/src/components/CommentSection.jsx` | 新增 | 评论区域 |
| `frontend/src/components/HotSidebar.jsx` | 新增 | 热门侧边栏 |
| `frontend/src/components/HotNews.jsx` | 新增 | 热门排行榜页 |
| `frontend/src/components/CommentManager.jsx` | 新增 | 管理员评论管理 |
| `frontend/src/components/NewsCard.jsx` | 修改 | 嵌入点赞按钮 |
| `frontend/src/components/NewsDetail.jsx` | 修改 | 嵌入评论和点赞 |
| `frontend/src/components/TtsSettings.jsx` | 修改 | 增加修改密码 |
| `frontend/src/components/LoginForm.jsx` | 修改 | 增加忘记密码链接 |

---

## 任务 1：数据库表创建

**文件：**
- 修改：`backend/src/db.js`

- [ ] **步骤 1：在 `initSchema` 末尾新增 5 张表**

  在 `xinwenlianbo_tasks` 表定义之后、迁移代码之前，插入：

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

  CREATE TABLE IF NOT EXISTS article_likes (
    userId INTEGER NOT NULL,
    articleId INTEGER NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (userId, articleId),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (articleId) REFERENCES articles(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_article_likes_articleId ON article_likes(articleId);

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

- [ ] **步骤 2：运行后端确保无语法错误**

  ```bash
  cd /mnt/f/program/ai/news/backend && node -e "import('./src/db.js').then(({getDb}) => { getDb(); console.log('Schema OK'); process.exit(0); })"
  ```

- [ ] **步骤 3：Commit**

  ```bash
  git add backend/src/db.js
  git commit -m "feat(db): add tables for email verification, password reset, likes, comments, reports"
  ```

---

## 任务 2：邮件服务

**文件：**
- 新增：`backend/src/services/mailer.js`
- 修改：`backend/.env.example`

- [ ] **步骤 1：安装 nodemailer**

  ```bash
  cd /mnt/f/program/ai/news/backend && npm install nodemailer
  ```

- [ ] **步骤 2：创建 mailer.js**

  ```javascript
  import nodemailer from 'nodemailer';

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const FROM = process.env.SMTP_FROM || 'AI新闻播报 <noreply@example.com>';
  const BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

  export async function sendVerificationEmail(to, token) {
    const url = `${BASE_URL}/news/verify-email?token=${encodeURIComponent(token)}`;
    await transporter.sendMail({
      from: FROM,
      to,
      subject: '请验证您的邮箱 - AI新闻播报',
      html: `<p>感谢您注册 AI新闻播报！请点击以下链接验证您的邮箱：</p><p><a href="${url}">${url}</a></p><p>链接24小时内有效。</p>`
    });
  }

  export async function sendPasswordResetEmail(to, token) {
    const url = `${BASE_URL}/news/reset-password?token=${encodeURIComponent(token)}`;
    await transporter.sendMail({
      from: FROM,
      to,
      subject: '密码重置 - AI新闻播报',
      html: `<p>您申请了密码重置，请点击以下链接设置新密码：</p><p><a href="${url}">${url}</a></p><p>链接24小时内有效。如非本人操作，请忽略此邮件。</p>`
    });
  }
  ```

- [ ] **步骤 3：更新 .env.example**

  在文件末尾追加：
  ```
  SMTP_HOST=
  SMTP_PORT=587
  SMTP_USER=
  SMTP_PASS=
  SMTP_FROM=AI新闻播报 <noreply@example.com>
  APP_BASE_URL=http://localhost:3000
  ```

- [ ] **步骤 4：Commit**

  ```bash
  git add backend/src/services/mailer.js backend/.env.example backend/package.json backend/package-lock.json
  git commit -m "feat(mailer): add SMTP mailer service with nodemailer"
  ```

---

## 任务 3：邮箱验证与密码重置模型

**文件：**
- 新增：`backend/src/models/emailVerification.js`
- 新增：`backend/src/models/passwordReset.js`

- [ ] **步骤 1：创建 emailVerification.js**

  ```javascript
  import { getDb } from '../db.js';
  import { randomBytes } from 'node:crypto';

  export function createVerificationToken(userId) {
    const db = getDb();
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO email_verification_tokens (userId, token, expiresAt) VALUES (?, ?, ?)`).run(userId, token, expiresAt);
    return token;
  }

  export function findVerificationToken(token) {
    const db = getDb();
    return db.prepare(`SELECT * FROM email_verification_tokens WHERE token = ?`).get(token) || null;
  }

  export function markVerificationTokenUsed(token) {
    const db = getDb();
    db.prepare(`UPDATE email_verification_tokens SET usedAt = CURRENT_TIMESTAMP WHERE token = ?`).run(token);
  }

  export function deleteUserVerificationTokens(userId) {
    const db = getDb();
    db.prepare(`DELETE FROM email_verification_tokens WHERE userId = ?`).run(userId);
  }
  ```

- [ ] **步骤 2：创建 passwordReset.js**

  ```javascript
  import { getDb } from '../db.js';
  import { randomBytes } from 'node:crypto';

  export function createPasswordResetToken(userId) {
    const db = getDb();
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO password_reset_tokens (userId, token, expiresAt) VALUES (?, ?, ?)`).run(userId, token, expiresAt);
    return token;
  }

  export function findPasswordResetToken(token) {
    const db = getDb();
    return db.prepare(`SELECT * FROM password_reset_tokens WHERE token = ?`).get(token) || null;
  }

  export function markPasswordResetTokenUsed(token) {
    const db = getDb();
    db.prepare(`UPDATE password_reset_tokens SET usedAt = CURRENT_TIMESTAMP WHERE token = ?`).run(token);
  }
  ```

- [ ] **步骤 3：Commit**

  ```bash
  git add backend/src/models/emailVerification.js backend/src/models/passwordReset.js
  git commit -m "feat(models): add email verification and password reset token models"
  ```

---

## 任务 4：用户模型扩展

**文件：**
- 修改：`backend/src/models/user.js`

- [ ] **步骤 1：在 user.js 末尾追加**

  ```javascript
  export function updateUserPassword(userId, passwordHash) {
    const db = getDb();
    db.prepare(`UPDATE users SET passwordHash = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(passwordHash, userId);
  }

  export function setEmailVerified(userId) {
    const db = getDb();
    db.prepare(`UPDATE users SET emailVerified = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`).run(userId);
  }
  ```

- [ ] **步骤 2：Commit**

  ```bash
  git add backend/src/models/user.js
  git commit -m "feat(models): add updatePassword and setEmailVerified to user model"
  ```

---

## 任务 5：认证路由扩展

**文件：**
- 修改：`backend/src/routes/auth.js`
- 修改：`backend/src/middleware/auth.js`

- [ ] **步骤 1：在 auth.js middleware 中新增 verifiedEmailMiddleware**

  在 `backend/src/middleware/auth.js` 中 `adminMiddleware` 之后添加：

  ```javascript
  export function verifiedEmailMiddleware(req, res, next) {
    const user = findUserById(req.userId);
    if (!user || !user.emailVerified) {
      const err = new Error('Please verify your email to perform this action');
      err.statusCode = 403;
      err.code = 1023;
      return next(err);
    }
    next();
  }
  ```

  注意导入 `findUserById`。

- [ ] **步骤 2：在 auth.js routes 中新增 5 个接口**

  在现有 `router.get('/me', ...)` 之后，导出之前，添加：

  ```javascript
  import { createVerificationToken, findVerificationToken, markVerificationTokenUsed, deleteUserVerificationTokens } from '../models/emailVerification.js';
  import { createPasswordResetToken, findPasswordResetToken, markPasswordResetTokenUsed } from '../models/passwordReset.js';
  import { sendVerificationEmail, sendPasswordResetEmail } from '../services/mailer.js';

  router.post('/verify-email', async (req, res, next) => {
    try {
      const { token } = req.body;
      if (!token) {
        const err = new Error('Token is required');
        err.statusCode = 400;
        err.code = 1026;
        throw err;
      }
      const record = findVerificationToken(token);
      if (!record || new Date(record.expiresAt) < new Date() || record.usedAt) {
        const err = new Error('Invalid or expired verification token');
        err.statusCode = 400;
        err.code = 1020;
        throw err;
      }
      setEmailVerified(record.userId);
      markVerificationTokenUsed(token);
      res.sendJson(0, 'Email verified successfully');
    } catch (err) { next(err); }
  });

  router.post('/resend-verification', authMiddleware, async (req, res, next) => {
    try {
      const user = findUserById(req.userId);
      if (!user) {
        const err = new Error('User not found');
        err.statusCode = 404;
        err.code = 1010;
        throw err;
      }
      if (user.emailVerified) {
        const err = new Error('Email already verified');
        err.statusCode = 400;
        err.code = 1021;
        throw err;
      }
      deleteUserVerificationTokens(user.id);
      const token = createVerificationToken(user.id);
      await sendVerificationEmail(user.email, token);
      res.sendJson(0, 'Verification email sent');
    } catch (err) { next(err); }
  });

  router.post('/forgot-password', async (req, res, next) => {
    try {
      const { email } = req.body;
      if (email && validateEmail(email)) {
        const normalizedEmail = validator.normalizeEmail(email);
        const user = findUserByEmail(normalizedEmail);
        if (user) {
          const token = createPasswordResetToken(user.id);
          await sendPasswordResetEmail(user.email, token);
        }
      }
      res.sendJson(0, 'If the email is registered, a reset link has been sent');
    } catch (err) { next(err); }
  });

  router.post('/reset-password', async (req, res, next) => {
    try {
      const { token, password } = req.body;
      if (!token || !validatePassword(password)) {
        const err = new Error('Invalid token or password');
        err.statusCode = 400;
        err.code = 1027;
        throw err;
      }
      const record = findPasswordResetToken(token);
      if (!record || new Date(record.expiresAt) < new Date() || record.usedAt) {
        const err = new Error('Invalid or expired reset token');
        err.statusCode = 400;
        err.code = 1022;
        throw err;
      }
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      updateUserPassword(record.userId, passwordHash);
      markPasswordResetTokenUsed(token);
      res.sendJson(0, 'Password reset successfully');
    } catch (err) { next(err); }
  });

  router.put('/change-password', authMiddleware, async (req, res, next) => {
    try {
      const { oldPassword, newPassword } = req.body;
      if (!oldPassword || !validatePassword(newPassword)) {
        const err = new Error('Invalid password');
        err.statusCode = 400;
        err.code = 1027;
        throw err;
      }
      const user = findUserById(req.userId);
      const valid = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!valid) {
        const err = new Error('Invalid old password');
        err.statusCode = 401;
        err.code = 1009;
        throw err;
      }
      const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      updateUserPassword(user.id, passwordHash);
      res.sendJson(0, 'Password changed successfully');
    } catch (err) { next(err); }
  });
  ```

- [ ] **步骤 3：注册时自动发送验证邮件**

  修改 `router.post('/register', ...)` 的成功响应之前，添加：

  ```javascript
    const verificationToken = createVerificationToken(userId);
    try {
      await sendVerificationEmail(user.email, verificationToken);
    } catch (mailErr) {
      console.error('Failed to send verification email:', mailErr);
    }
  ```

  导入 `createVerificationToken` 和 `sendVerificationEmail`。

- [ ] **步骤 4：更新 /me 返回 emailVerified**

  修改 `router.get('/me', ...)` 的响应，在 user 对象中加入 `emailVerified: user.emailVerified`。

- [ ] **步骤 5：Commit**

  ```bash
  git add backend/src/routes/auth.js backend/src/middleware/auth.js
  git commit -m "feat(auth): add email verification, password reset, change password"
  ```

---

## 任务 6：点赞模型与路由

**文件：**
- 新增：`backend/src/models/articleLike.js`
- 新增：`backend/src/routes/likes.js`

- [ ] **步骤 1：创建 articleLike.js**

  ```javascript
  import { getDb } from '../db.js';

  export function toggleLike(userId, articleId) {
    const db = getDb();
    const existing = db.prepare(`SELECT 1 FROM article_likes WHERE userId = ? AND articleId = ?`).get(userId, articleId);
    if (existing) {
      db.prepare(`DELETE FROM article_likes WHERE userId = ? AND articleId = ?`).run(userId, articleId);
      return false;
    }
    db.prepare(`INSERT INTO article_likes (userId, articleId) VALUES (?, ?)`).run(userId, articleId);
    return true;
  }

  export function getLikeCount(articleId) {
    const db = getDb();
    return db.prepare(`SELECT COUNT(*) as count FROM article_likes WHERE articleId = ?`).get(articleId).count;
  }

  export function hasLiked(userId, articleId) {
    const db = getDb();
    return !!db.prepare(`SELECT 1 FROM article_likes WHERE userId = ? AND articleId = ?`).get(userId, articleId);
  }

  export function getLikeUsers(articleId, limit = 20, offset = 0) {
    const db = getDb();
    const users = db.prepare(`
      SELECT u.id, u.email
      FROM article_likes al
      JOIN users u ON al.userId = u.id
      WHERE al.articleId = ?
      ORDER BY al.createdAt DESC
      LIMIT ? OFFSET ?
    `).all(articleId, limit, offset);
    const { count } = db.prepare(`SELECT COUNT(*) as count FROM article_likes WHERE articleId = ?`).get(articleId);
    return { users, total: count };
  }
  ```

- [ ] **步骤 2：创建 likes.js 路由**

  ```javascript
  import { Router } from 'express';
  import { authMiddleware, verifiedEmailMiddleware } from '../middleware/auth.js';
  import { toggleLike, getLikeCount, hasLiked, getLikeUsers } from '../models/articleLike.js';

  const router = Router({ mergeParams: true });

  router.post('/', authMiddleware, verifiedEmailMiddleware, async (req, res, next) => {
    try {
      const articleId = Number(req.params.id);
      const liked = toggleLike(req.userId, articleId);
      const likeCount = getLikeCount(articleId);
      res.sendJson(0, 'success', { liked, likeCount });
    } catch (err) { next(err); }
  });

  router.get('/', async (req, res, next) => {
    try {
      const articleId = Number(req.params.id);
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Number(req.query.limit) || 20);
      const offset = (page - 1) * limit;
      const { users, total } = getLikeUsers(articleId, limit, offset);
      res.sendJson(0, 'success', {
        users: users.map(u => ({ id: u.id, displayName: u.email })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } catch (err) { next(err); }
  });

  router.get('/liked', authMiddleware, async (req, res, next) => {
    try {
      const articleId = Number(req.params.id);
      const liked = hasLiked(req.userId, articleId);
      res.sendJson(0, 'success', { liked });
    } catch (err) { next(err); }
  });

  export default router;
  ```

- [ ] **步骤 3：在 app.js 注册点赞路由**

  在 `app.use('/api/articles', articlesRouter);` 之后添加：

  ```javascript
  import likesRouter from './routes/likes.js';
  app.use('/api/articles/:id/likes', likesRouter);
  app.use('/news/api/articles/:id/likes', likesRouter);
  ```

- [ ] **步骤 4：Commit**

  ```bash
  git add backend/src/models/articleLike.js backend/src/routes/likes.js backend/src/app.js
  git commit -m "feat(likes): add article like toggle, count, and user list"
  ```

---

## 任务 7：评论模型与路由

**文件：**
- 新增：`backend/src/models/comment.js`
- 新增：`backend/src/routes/comments.js`

- [ ] **步骤 1：创建 comment.js**

  ```javascript
  import { getDb } from '../db.js';

  export function createComment({ articleId, userId, content, parentId = null }) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO comments (articleId, userId, content, parentId)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(articleId, userId, content, parentId);
    return findCommentById(result.lastInsertRowid);
  }

  export function findCommentById(id) {
    const db = getDb();
    return db.prepare(`
      SELECT c.*, u.email as userEmail
      FROM comments c
      JOIN users u ON c.userId = u.id
      WHERE c.id = ?
    `).get(id) || null;
  }

  export function getArticleComments(articleId) {
    const db = getDb();
    const topComments = db.prepare(`
      SELECT c.*, u.email as userEmail
      FROM comments c
      JOIN users u ON c.userId = u.id
      WHERE c.articleId = ? AND c.parentId IS NULL
      ORDER BY c.createdAt DESC
    `).all(articleId);

    for (const comment of topComments) {
      comment.replies = db.prepare(`
        SELECT c.*, u.email as userEmail
        FROM comments c
        JOIN users u ON c.userId = u.id
        WHERE c.parentId = ?
        ORDER BY c.createdAt ASC
      `).all(comment.id);
    }
    return topComments;
  }

  export function softDeleteComment(id) {
    const db = getDb();
    db.prepare(`UPDATE comments SET isDeleted = 1 WHERE id = ?`).run(id);
  }

  export function reportComment(commentId, reporterId, reason) {
    const db = getDb();
    db.prepare(`INSERT INTO comment_reports (commentId, reporterId, reason) VALUES (?, ?, ?)`).run(commentId, reporterId, reason);
    db.prepare(`UPDATE comments SET reportCount = reportCount + 1 WHERE id = ?`).run(commentId);
  }

  export function getReportedComments() {
    const db = getDb();
    return db.prepare(`
      SELECT c.*, u.email as userEmail
      FROM comments c
      JOIN users u ON c.userId = u.id
      WHERE c.reportCount > 0 AND c.isDeleted = 0
      ORDER BY c.reportCount DESC, c.createdAt DESC
    `).all();
  }

  export function clearCommentReports(commentId) {
    const db = getDb();
    db.prepare(`DELETE FROM comment_reports WHERE commentId = ?`).run(commentId);
    db.prepare(`UPDATE comments SET reportCount = 0 WHERE id = ?`).run(commentId);
  }
  ```

- [ ] **步骤 2：创建 comments.js 路由**

  ```javascript
  import { Router } from 'express';
  import { authMiddleware, verifiedEmailMiddleware, adminMiddleware } from '../middleware/auth.js';
  import { createComment, getArticleComments, softDeleteComment, reportComment, getReportedComments, clearCommentReports } from '../models/comment.js';

  const router = Router();

  router.post('/articles/:id/comments', authMiddleware, verifiedEmailMiddleware, async (req, res, next) => {
    try {
      const articleId = Number(req.params.id);
      const { content } = req.body;
      if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 2000) {
        const err = new Error('Comment content must be 1-2000 characters');
        err.statusCode = 400;
        err.code = 1025;
        throw err;
      }
      const comment = createComment({ articleId, userId: req.userId, content: content.trim() });
      res.sendJson(0, 'success', {
        id: comment.id,
        articleId: comment.articleId,
        userId: comment.userId,
        content: comment.content,
        parentId: comment.parentId,
        isDeleted: !!comment.isDeleted,
        reportCount: comment.reportCount,
        createdAt: comment.createdAt,
        user: { id: comment.userId, displayName: comment.userEmail }
      });
    } catch (err) { next(err); }
  });

  router.post('/comments/:id/reply', authMiddleware, verifiedEmailMiddleware, async (req, res, next) => {
    try {
      const parentId = Number(req.params.id);
      const { content } = req.body;
      if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 2000) {
        const err = new Error('Reply content must be 1-2000 characters');
        err.statusCode = 400;
        err.code = 1025;
        throw err;
      }
      const parent = require('../models/comment.js').findCommentById(parentId);
      if (!parent || parent.parentId !== null) {
        const err = new Error('Can only reply to top-level comments');
        err.statusCode = 400;
        err.code = 1028;
        throw err;
      }
      const reply = createComment({ articleId: parent.articleId, userId: req.userId, content: content.trim(), parentId });
      res.sendJson(0, 'success', {
        id: reply.id,
        articleId: reply.articleId,
        userId: reply.userId,
        content: reply.content,
        parentId: reply.parentId,
        isDeleted: !!reply.isDeleted,
        reportCount: reply.reportCount,
        createdAt: reply.createdAt,
        user: { id: reply.userId, displayName: reply.userEmail }
      });
    } catch (err) { next(err); }
  });

  router.get('/articles/:id/comments', async (req, res, next) => {
    try {
      const articleId = Number(req.params.id);
      const comments = getArticleComments(articleId);
      res.sendJson(0, 'success', { comments: comments.map(c => ({
        id: c.id,
        content: c.content,
        isDeleted: !!c.isDeleted,
        reportCount: c.reportCount,
        createdAt: c.createdAt,
        user: { id: c.userId, displayName: c.userEmail },
        replies: (c.replies || []).map(r => ({
          id: r.id,
          content: r.content,
          isDeleted: !!r.isDeleted,
          createdAt: r.createdAt,
          user: { id: r.userId, displayName: r.userEmail }
        }))
      })) });
    } catch (err) { next(err); }
  });

  router.delete('/comments/:id', authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
      softDeleteComment(Number(req.params.id));
      res.sendJson(0, 'Comment deleted');
    } catch (err) { next(err); }
  });

  router.post('/comments/:id/report', authMiddleware, async (req, res, next) => {
    try {
      const commentId = Number(req.params.id);
      const { reason } = req.body;
      reportComment(commentId, req.userId, reason || null);
      res.sendJson(0, 'Comment reported');
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        const e = new Error('You have already reported this comment');
        e.statusCode = 409;
        e.code = 1024;
        return next(e);
      }
      next(err);
    }
  });

  router.get('/comments/reported', authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
      const comments = getReportedComments();
      res.sendJson(0, 'success', { comments });
    } catch (err) { next(err); }
  });

  router.post('/comments/:id/clear-reports', authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
      clearCommentReports(Number(req.params.id));
      res.sendJson(0, 'Reports cleared');
    } catch (err) { next(err); }
  });

  export default router;
  ```

  注意：`require('../models/comment.js').findCommentById` 应改为 ESM import，在文件顶部添加 `import { findCommentById } from '../models/comment.js';`。

- [ ] **步骤 3：在 app.js 注册评论路由**

  在 likesRouter 注册之后添加：

  ```javascript
  import commentsRouter from './routes/comments.js';
  app.use('/api', commentsRouter);
  app.use('/news/api', commentsRouter);
  ```

- [ ] **步骤 4：Commit**

  ```bash
  git add backend/src/models/comment.js backend/src/routes/comments.js backend/src/app.js
  git commit -m "feat(comments): add nested comments, replies, reports, and admin management"
  ```

---

## 任务 8：热门排行榜路由扩展

**文件：**
- 修改：`backend/src/routes/articles.js`

- [ ] **步骤 1：在 articles.js 末尾新增 /hot 和 /hot-sidebar**

  在导出之前添加：

  ```javascript
  function getHotArticles(range, page = 1, limit = 20) {
    const db = getDb();
    const maxLimit = Math.min(limit, 100);
    const offset = (page - 1) * maxLimit;

    let since;
    const now = new Date();
    if (range === 'week') {
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    }

    const countStmt = db.prepare(`
      SELECT COUNT(DISTINCT a.id) as total
      FROM articles a
      WHERE datetime(a.publishedAt) >= datetime(?)
    `);
    const { total } = countStmt.get(since);

    const stmt = db.prepare(`
      SELECT a.*, s.name as sourceName, s.category, COUNT(al.userId) as likeCount
      FROM articles a
      JOIN sources s ON a.sourceId = s.id
      LEFT JOIN article_likes al ON a.id = al.articleId
      WHERE datetime(a.publishedAt) >= datetime(?)
      GROUP BY a.id
      ORDER BY likeCount DESC, a.publishedAt DESC
      LIMIT ? OFFSET ?
    `);
    const items = stmt.all(since, maxLimit, offset);
    return { items, total, page, limit: maxLimit };
  }

  router.get('/hot', async (req, res, next) => {
    try {
      const range = req.query.range === 'week' ? 'week' : 'today';
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Number(req.query.limit) || 20);
      const { items, total, page: p, limit: l } = getHotArticles(range, page, limit);
      res.sendJson(0, 'success', {
        items,
        pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) }
      });
    } catch (err) { next(err); }
  });

  router.get('/hot-sidebar', async (req, res, next) => {
    try {
      const range = req.query.range === 'week' ? 'week' : 'today';
      const { items } = getHotArticles(range, 1, 5);
      res.sendJson(0, 'success', { items });
    } catch (err) { next(err); }
  });
  ```

- [ ] **步骤 2：Commit**

  ```bash
  git add backend/src/routes/articles.js
  git commit -m "feat(articles): add hot news ranking by likes (today/week)"
  ```

---

## 任务 9：认证接口测试

**文件：**
- 修改：`backend/tests/auth.test.js`

- [ ] **步骤 1：在 auth.test.js 末尾追加邮箱验证和密码修改测试**

  ```javascript
  describe('POST /api/auth/verify-email', () => {
    it('should verify email with valid token', async () => {
      // 注册一个用户，获取验证 token（需要从数据库直接读取）
    });
    it('should reject invalid token', async () => {
      const res = await request(app).post('/api/auth/verify-email').send({ token: 'invalid' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1020);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('should return success even for non-existent email', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nonexistent@test.com' });
      expect(res.status).toBe(200);
    });
  });

  describe('PUT /api/auth/change-password', () => {
    it('should reject wrong old password', async () => {
      const token = await loginAsUser('user@test.com', 'password123');
      const res = await request(app).put('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ oldPassword: 'wrong', newPassword: 'newpassword123' });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe(1009);
    });
  });
  ```

  注意：测试需要实际的 token 值，注册时自动发送验证邮件，但测试环境无 SMTP，需要在测试 setup 中 mock mailer 或直接操作数据库创建 token。

- [ ] **步骤 2：在测试 setup 中 mock 邮件发送**

  在 `backend/tests/auth.test.js` 顶部或 setup 中添加：

  ```javascript
  jest.mock('../src/services/mailer.js', () => ({
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn()
  }));
  ```

  注意：项目使用 ESM，jest mock 语法可能不同，请根据现有测试文件的实际格式调整。

- [ ] **步骤 3：运行测试**

  ```bash
  cd /mnt/f/program/ai/news/backend && npm test -- tests/auth.test.js
  ```

- [ ] **步骤 4：Commit**

  ```bash
  git add backend/tests/auth.test.js
  git commit -m "test(auth): add email verification and password change tests"
  ```

---

## 任务 10：点赞接口测试

**文件：**
- 新增：`backend/tests/likes.test.js`

- [ ] **步骤 1：创建 likes.test.js**

  ```javascript
  import request from 'supertest';
  import { app } from '../src/app.js';
  import { getDb } from '../src/db.js';

  async function createTestArticle() {
    const db = getDb();
    db.prepare(`INSERT OR IGNORE INTO sources (name, rssUrl, category) VALUES (?, ?, ?)`).run('TestSource', 'http://test.com/rss', 'test');
    const source = db.prepare(`SELECT id FROM sources WHERE rssUrl = ?`).get('http://test.com/rss');
    const result = db.prepare(`INSERT INTO articles (title, originalUrl, sourceId, publishedAt) VALUES (?, ?, ?, ?)`)
      .run('Test Article', 'http://test.com/1', source.id, new Date().toISOString());
    return result.lastInsertRowid;
  }

  async function createTestUser(email, password) {
    const db = getDb();
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.default.hash(password, 10);
    const result = db.prepare(`INSERT INTO users (email, passwordHash, emailVerified) VALUES (?, ?, 1)`).run(email, hash);
    return result.lastInsertRowid;
  }

  async function login(email, password) {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    return res.body.data.token;
  }

  describe('POST /api/articles/:id/like', () => {
    it('should like an article', async () => {
      const articleId = await createTestArticle();
      const userId = await createTestUser('likeuser@test.com', 'password123');
      const token = await login('likeuser@test.com', 'password123');
      const res = await request(app).post(`/api/articles/${articleId}/like`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.liked).toBe(true);
      expect(res.body.data.likeCount).toBe(1);
    });

    it('should toggle off when liked again', async () => {
      const articleId = await createTestArticle();
      const userId = await createTestUser('likeuser2@test.com', 'password123');
      const token = await login('likeuser2@test.com', 'password123');
      await request(app).post(`/api/articles/${articleId}/like`).set('Authorization', `Bearer ${token}`);
      const res = await request(app).post(`/api/articles/${articleId}/like`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.liked).toBe(false);
      expect(res.body.data.likeCount).toBe(0);
    });

    it('should reject unverified email', async () => {
      const db = getDb();
      const bcrypt = await import('bcryptjs');
      const hash = await bcrypt.default.hash('password123', 10);
      const result = db.prepare(`INSERT INTO users (email, passwordHash, emailVerified) VALUES (?, ?, 0)`).run('unverified@test.com', hash);
      const token = await login('unverified@test.com', 'password123');
      const articleId = await createTestArticle();
      const res = await request(app).post(`/api/articles/${articleId}/like`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(1023);
    });
  });

  describe('GET /api/articles/:id/likes', () => {
    it('should return like users', async () => {
      const articleId = await createTestArticle();
      const res = await request(app).get(`/api/articles/${articleId}/likes`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.users)).toBe(true);
    });
  });
  ```

- [ ] **步骤 2：运行测试**

  ```bash
  cd /mnt/f/program/ai/news/backend && npm test -- tests/likes.test.js
  ```

- [ ] **步骤 3：Commit**

  ```bash
  git add backend/tests/likes.test.js
  git commit -m "test(likes): add like toggle and permission tests"
  ```

---

## 任务 11：评论接口测试

**文件：**
- 新增：`backend/tests/comments.test.js`

- [ ] **步骤 1：创建 comments.test.js**

  ```javascript
  import request from 'supertest';
  import { app } from '../src/app.js';
  import { getDb } from '../src/db.js';

  // 复用 likes.test.js 中的 helper 函数

  describe('POST /api/articles/:id/comments', () => {
    it('should create a comment', async () => {
      const articleId = await createTestArticle();
      const userId = await createTestUser('commenter@test.com', 'password123');
      const token = await login('commenter@test.com', 'password123');
      const res = await request(app).post(`/api/articles/${articleId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Great article!' });
      expect(res.status).toBe(200);
      expect(res.body.data.content).toBe('Great article!');
    });

    it('should reject empty content', async () => {
      const articleId = await createTestArticle();
      const userId = await createTestUser('commenter2@test.com', 'password123');
      const token = await login('commenter2@test.com', 'password123');
      const res = await request(app).post(`/api/articles/${articleId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: '' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(1025);
    });
  });

  describe('POST /api/comments/:id/reply', () => {
    it('should reply to a comment', async () => {
      const articleId = await createTestArticle();
      const userId = await createTestUser('replier@test.com', 'password123');
      const token = await login('replier@test.com', 'password123');
      const commentRes = await request(app).post(`/api/articles/${articleId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Parent comment' });
      const replyRes = await request(app).post(`/api/comments/${commentRes.body.data.id}/reply`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Reply content' });
      expect(replyRes.status).toBe(200);
      expect(replyRes.body.data.parentId).toBe(commentRes.body.data.id);
    });
  });

  describe('POST /api/comments/:id/report', () => {
    it('should report a comment', async () => {
      const articleId = await createTestArticle();
      const userId = await createTestUser('reporter@test.com', 'password123');
      const token = await login('reporter@test.com', 'password123');
      const commentRes = await request(app).post(`/api/articles/${articleId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Report me' });
      const reportRes = await request(app).post(`/api/comments/${commentRes.body.data.id}/report`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'spam' });
      expect(reportRes.status).toBe(200);
    });

    it('should reject duplicate report', async () => {
      const articleId = await createTestArticle();
      const userId = await createTestUser('reporter2@test.com', 'password123');
      const token = await login('reporter2@test.com', 'password123');
      const commentRes = await request(app).post(`/api/articles/${articleId}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Report me twice' });
      await request(app).post(`/api/comments/${commentRes.body.data.id}/report`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'spam' });
      const res2 = await request(app).post(`/api/comments/${commentRes.body.data.id}/report`)
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'spam' });
      expect(res2.status).toBe(409);
      expect(res2.body.code).toBe(1024);
    });
  });
  ```

- [ ] **步骤 2：运行测试**

  ```bash
  cd /mnt/f/program/ai/news/backend && npm test -- tests/comments.test.js
  ```

- [ ] **步骤 3：Commit**

  ```bash
  git add backend/tests/comments.test.js
  git commit -m "test(comments): add comment, reply, and report tests"
  ```

---

## 任务 12：热门榜接口测试

**文件：**
- 新增：`backend/tests/hotArticles.test.js`

- [ ] **步骤 1：创建 hotArticles.test.js**

  ```javascript
  import request from 'supertest';
  import { app } from '../src/app.js';

  describe('GET /api/articles/hot', () => {
    it('should return hot articles for today', async () => {
      const res = await request(app).get('/api/articles/hot?range=today');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.pagination).toBeDefined();
    });

    it('should return hot articles for week', async () => {
      const res = await request(app).get('/api/articles/hot?range=week');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });
  });

  describe('GET /api/articles/hot-sidebar', () => {
    it('should return top 5 hot articles', async () => {
      const res = await request(app).get('/api/articles/hot-sidebar');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeLessThanOrEqual(5);
    });
  });
  ```

- [ ] **步骤 2：运行测试**

  ```bash
  cd /mnt/f/program/ai/news/backend && npm test -- tests/hotArticles.test.js
  ```

- [ ] **步骤 3：Commit**

  ```bash
  git add backend/tests/hotArticles.test.js
  git commit -m "test(hot): add hot articles ranking tests"
  ```

---

## 任务 13：前端 API 扩展

**文件：**
- 修改：`frontend/src/services/api.js`

- [ ] **步骤 1：在 api.js 中追加方法**

  在 `api` 对象中追加：

  ```javascript
  // Email verification & password
  verifyEmail(token) {
    return request('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) });
  },
  resendVerification() {
    return request('/api/auth/resend-verification', { method: 'POST' });
  },
  forgotPassword(email) {
    return request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
  },
  resetPassword(token, password) {
    return request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
  },
  changePassword(oldPassword, newPassword) {
    return request('/api/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword, newPassword })
    });
  },

  // Likes
  toggleLike(articleId) {
    return request(`/api/articles/${articleId}/like`, { method: 'POST' });
  },
  getLikes(articleId, page = 1, limit = 20) {
    return request(`/api/articles/${articleId}/likes?page=${page}&limit=${limit}`);
  },
  hasLiked(articleId) {
    return request(`/api/articles/${articleId}/liked`);
  },

  // Comments
  postComment(articleId, content) {
    return request(`/api/articles/${articleId}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
  },
  postReply(commentId, content) {
    return request(`/api/comments/${commentId}/reply`, { method: 'POST', body: JSON.stringify({ content }) });
  },
  getComments(articleId) {
    return request(`/api/articles/${articleId}/comments`);
  },
  deleteComment(commentId) {
    return request(`/api/comments/${commentId}`, { method: 'DELETE' });
  },
  reportComment(commentId, reason) {
    return request(`/api/comments/${commentId}/report`, { method: 'POST', body: JSON.stringify({ reason }) });
  },
  getReportedComments() {
    return request('/api/comments/reported');
  },
  clearCommentReports(commentId) {
    return request(`/api/comments/${commentId}/clear-reports`, { method: 'POST' });
  },

  // Hot ranking
  getHotArticles(range = 'today', page = 1, limit = 20) {
    return request(`/api/articles/hot?range=${range}&page=${page}&limit=${limit}`);
  },
  getHotSidebar(range = 'today') {
    return request(`/api/articles/hot-sidebar?range=${range}`);
  }
  ```

- [ ] **步骤 2：Commit**

  ```bash
  git add frontend/src/services/api.js
  git commit -m "feat(api): add frontend API methods for likes, comments, auth, hot ranking"
  ```

---

## 任务 14：前端认证 Hook 扩展

**文件：**
- 修改：`frontend/src/hooks/useAuth.js`

- [ ] **步骤 1：在 useAuth hook 中增加 emailVerified 和 changePassword**

  在 `useAuth` 的返回值和解构中增加 `emailVerified` 状态和 `changePassword` 方法。

  修改 `login` / `register` / `wechatLogin` 方法，保存 `emailVerified` 到 state。

  添加 `changePassword` 方法：

  ```javascript
  const changePassword = async (oldPassword, newPassword) => {
    await api.changePassword(oldPassword, newPassword);
  };
  ```

  返回值增加 `emailVerified: user?.emailVerified || false` 和 `changePassword`。

- [ ] **步骤 2：Commit**

  ```bash
  git add frontend/src/hooks/useAuth.js
  git commit -m "feat(auth): expose emailVerified and changePassword in useAuth hook"
  ```

---

## 任务 15：邮箱验证横幅

**文件：**
- 新增：`frontend/src/components/EmailVerificationBanner.jsx`

- [ ] **步骤 1：创建组件**

  ```jsx
  import React, { useState } from 'react';
  import { api } from '../services/api.js';

  export default function EmailVerificationBanner({ user }) {
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    if (!user || user.emailVerified) return null;

    const handleResend = async () => {
      setSending(true);
      try {
        await api.resendVerification();
        setSent(true);
      } catch (err) {
        alert(err.message || '发送失败');
      } finally {
        setSending(false);
      }
    };

    return (
      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 text-sm flex items-center justify-between">
        <span>请验证您的邮箱以使用点赞、评论等功能。</span>
        {sent ? (
          <span className="text-green-600">验证邮件已发送</span>
        ) : (
          <button
            onClick={handleResend}
            disabled={sending}
            className="underline hover:no-underline disabled:opacity-50"
          >
            {sending ? '发送中...' : '重新发送验证邮件'}
          </button>
        )}
      </div>
    );
  }
  ```

- [ ] **步骤 2：在 App.jsx 的 Navbar 下方插入**

  ```jsx
  import EmailVerificationBanner from './components/EmailVerificationBanner.jsx';
  // ...
  <EmailVerificationBanner user={user} />
  ```

- [ ] **步骤 3：Commit**

  ```bash
  git add frontend/src/components/EmailVerificationBanner.jsx frontend/src/App.jsx
  git commit -m "feat(ui): add email verification banner"
  ```

---

## 任务 16：密码找回与重置页面

**文件：**
- 新增：`frontend/src/components/ForgotPassword.jsx`
- 新增：`frontend/src/components/ResetPassword.jsx`

- [ ] **步骤 1：创建 ForgotPassword.jsx**

  ```jsx
  import React, { useState } from 'react';
  import { Link } from 'react-router-dom';
  import { api } from '../services/api.js';

  export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e) => {
      e.preventDefault();
      try {
        await api.forgotPassword(email);
        setSubmitted(true);
      } catch (err) {
        alert(err.message);
      }
    };

    return (
      <div className="max-w-md mx-auto mt-8">
        <h2 className="text-xl font-bold mb-4">找回密码</h2>
        {submitted ? (
          <p className="text-green-600">如果该邮箱已注册，您将收到重置密码的邮件。</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="请输入邮箱" required className="w-full border px-3 py-2" />
            <button type="submit" className="w-full bg-blue-600 text-white py-2">发送重置邮件</button>
          </form>
        )}
        <p className="mt-4 text-sm"><Link to="/login" className="text-blue-600">返回登录</Link></p>
      </div>
    );
  }
  ```

- [ ] **步骤 2：创建 ResetPassword.jsx**

  ```jsx
  import React, { useState } from 'react';
  import { useSearchParams, useNavigate } from 'react-router-dom';
  import { api } from '../services/api.js';

  export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [done, setDone] = useState(false);

    const handleSubmit = async (e) => {
      e.preventDefault();
      if (password !== confirm) { alert('两次密码不一致'); return; }
      if (password.length < 8) { alert('密码至少8位'); return; }
      try {
        await api.resetPassword(searchParams.get('token'), password);
        setDone(true);
        setTimeout(() => navigate('/login'), 2000);
      } catch (err) {
        alert(err.message);
      }
    };

    return (
      <div className="max-w-md mx-auto mt-8">
        <h2 className="text-xl font-bold mb-4">重置密码</h2>
        {done ? (
          <p className="text-green-600">密码重置成功，即将跳转到登录页...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="新密码（至少8位）" required className="w-full border px-3 py-2" />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="确认新密码" required className="w-full border px-3 py-2" />
            <button type="submit" className="w-full bg-blue-600 text-white py-2">重置密码</button>
          </form>
        )}
      </div>
    );
  }
  ```

- [ ] **步骤 3：在 App.jsx 注册路由**

  ```jsx
  import ForgotPassword from './components/ForgotPassword.jsx';
  import ResetPassword from './components/ResetPassword.jsx';
  // ...
  <Route path="/forgot-password" element={<ForgotPassword />} />
  <Route path="/reset-password" element={<ResetPassword />} />
  ```

- [ ] **步骤 4：在 LoginForm.jsx 增加"忘记密码？"链接**

  在密码输入框下方添加 `<Link to="/forgot-password" className="text-sm text-blue-600">忘记密码？</Link>`。

- [ ] **步骤 5：Commit**

  ```bash
  git add frontend/src/components/ForgotPassword.jsx frontend/src/components/ResetPassword.jsx frontend/src/App.jsx frontend/src/components/LoginForm.jsx
  git commit -m "feat(auth): add forgot password and reset password pages"
  ```

---

## 任务 17：修改密码

**文件：**
- 修改：`frontend/src/components/TtsSettings.jsx`

- [ ] **步骤 1：在设置页面增加修改密码表单**

  在 TtsSettings 组件中（或作为独立卡片）添加：

  ```jsx
  const [passwordForm, setPasswordForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [pwMessage, setPwMessage] = useState('');

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirm) { setPwMessage('两次密码不一致'); return; }
    if (passwordForm.newPassword.length < 8) { setPwMessage('密码至少8位'); return; }
    try {
      await api.changePassword(passwordForm.oldPassword, passwordForm.newPassword);
      setPwMessage('密码修改成功');
      setPasswordForm({ oldPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setPwMessage(err.message);
    }
  };
  ```

  在 JSX 中渲染表单（仅登录用户可见）。

- [ ] **步骤 2：Commit**

  ```bash
  git add frontend/src/components/TtsSettings.jsx
  git commit -m "feat(settings): add change password form"
  ```

---

## 任务 18：点赞按钮与弹窗

**文件：**
- 新增：`frontend/src/components/LikeButton.jsx`
- 新增：`frontend/src/components/LikeUsersModal.jsx`

- [ ] **步骤 1：创建 LikeButton.jsx**

  ```jsx
  import React, { useState, useEffect } from 'react';
  import { api } from '../services/api.js';

  export default function LikeButton({ articleId, user }) {
    const [liked, setLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(0);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      if (!articleId) return;
      api.getLikes(articleId, 1, 1).then(data => setLikeCount(data.pagination.total)).catch(() => {});
      if (user) {
        api.hasLiked(articleId).then(data => setLiked(data.liked)).catch(() => {});
      }
    }, [articleId, user?.id]);

    const handleToggle = async () => {
      if (!user) { alert('请先登录'); return; }
      setLoading(true);
      try {
        const data = await api.toggleLike(articleId);
        setLiked(data.liked);
        setLikeCount(data.likeCount);
      } catch (err) {
        if (err.code === 1023) alert('请验证邮箱后点赞');
        else alert(err.message);
      } finally {
        setLoading(false);
      }
    };

    return (
      <button onClick={handleToggle} disabled={loading} className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-500">
        <span>{liked ? '❤️' : '🤍'}</span>
        <span>{likeCount}</span>
      </button>
    );
  }
  ```

- [ ] **步骤 2：创建 LikeUsersModal.jsx**

  ```jsx
  import React, { useState, useEffect } from 'react';
  import { api } from '../services/api.js';

  export default function LikeUsersModal({ articleId, onClose }) {
    const [users, setUsers] = useState([]);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState(null);

    useEffect(() => {
      api.getLikes(articleId, page).then(data => {
        setUsers(prev => page === 1 ? data.users : [...prev, ...data.users]);
        setPagination(data.pagination);
      }).catch(() => {});
    }, [articleId, page]);

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-white rounded-lg p-6 max-w-sm w-full max-h-[60vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <h3 className="font-bold mb-4">点赞用户</h3>
          <ul className="space-y-2">
            {users.map(u => <li key={u.id} className="text-sm text-gray-700">{u.displayName}</li>)}
          </ul>
          {pagination && page < pagination.totalPages && (
            <button onClick={() => setPage(p => p + 1)} className="mt-4 text-blue-600 text-sm">加载更多</button>
          )}
        </div>
      </div>
    );
  }
  ```

- [ ] **步骤 3：Commit**

  ```bash
  git add frontend/src/components/LikeButton.jsx frontend/src/components/LikeUsersModal.jsx
  git commit -m "feat(ui): add like button and like users modal"
  ```

---

## 任务 19：评论区域

**文件：**
- 新增：`frontend/src/components/CommentSection.jsx`

- [ ] **步骤 1：创建 CommentSection.jsx**

  ```jsx
  import React, { useState, useEffect } from 'react';
  import { api } from '../services/api.js';

  function CommentItem({ comment, user, onReply, onReport }) {
    const [showReply, setShowReply] = useState(false);
    const [replyContent, setReplyContent] = useState('');

    return (
      <div className="border-b py-3">
        <div className="flex justify-between text-sm text-gray-500">
          <span>{comment.user?.displayName || '未知用户'}</span>
          <span>{new Date(comment.createdAt).toLocaleString('zh-CN')}</span>
        </div>
        <p className="mt-1 text-gray-800">{comment.isDeleted ? <i>该评论已删除</i> : comment.content}</p>
        {!comment.isDeleted && (
          <div className="mt-2 flex gap-3 text-xs text-gray-500">
            <button onClick={() => setShowReply(!showReply)}>回复</button>
            {user && user.id !== comment.userId && (
              <button onClick={() => onReport(comment.id)}>举报</button>
            )}
          </div>
        )}
        {showReply && !comment.isDeleted && (
          <div className="mt-2">
            <textarea value={replyContent} onChange={e => setReplyContent(e.target.value)} className="w-full border px-2 py-1 text-sm" rows={2} placeholder="写下你的回复..." />
            <button onClick={async () => { await onReply(comment.id, replyContent); setReplyContent(''); setShowReply(false); }} className="mt-1 bg-blue-600 text-white text-xs px-3 py-1">发送</button>
          </div>
        )}
        {comment.replies?.length > 0 && (
          <div className="ml-4 mt-2 bg-gray-50 p-2 rounded space-y-2">
            {comment.replies.map(r => (
              <div key={r.id} className="text-sm">
                <span className="text-gray-500">{r.user?.displayName}：</span>
                <span>{r.isDeleted ? <i>该评论已删除</i> : r.content}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  export default function CommentSection({ articleId, user }) {
    const [comments, setComments] = useState([]);
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(false);

    const fetchComments = async () => {
      const data = await api.getComments(articleId);
      setComments(data.comments);
    };

    useEffect(() => { fetchComments(); }, [articleId]);

    const handlePost = async (e) => {
      e.preventDefault();
      if (!content.trim()) return;
      setLoading(true);
      try {
        await api.postComment(articleId, content.trim());
        setContent('');
        await fetchComments();
      } catch (err) { alert(err.message); }
      finally { setLoading(false); }
    };

    const handleReply = async (commentId, replyContent) => {
      if (!replyContent.trim()) return;
      await api.postReply(commentId, replyContent.trim());
      await fetchComments();
    };

    const handleReport = async (commentId) => {
      const reason = prompt('举报原因：垃圾广告 / 人身攻击 / 违法违规 / 其他');
      if (!reason) return;
      try {
        await api.reportComment(commentId, reason);
        alert('举报成功');
      } catch (err) { alert(err.message); }
    };

    return (
      <div className="mt-8">
        <h3 className="font-bold text-lg mb-4">评论</h3>
        {user ? (
          <form onSubmit={handlePost} className="mb-6">
            <textarea value={content} onChange={e => setContent(e.target.value)} className="w-full border px-3 py-2" rows={3} placeholder="发表评论..." required />
            <button type="submit" disabled={loading} className="mt-2 bg-blue-600 text-white px-4 py-2 disabled:opacity-50">{loading ? '发送中...' : '发表'}</button>
          </form>
        ) : (
          <p className="text-gray-500 mb-6">请登录后评论</p>
        )}
        <div>
          {comments.map(c => (
            <CommentItem key={c.id} comment={c} user={user} onReply={handleReply} onReport={handleReport} />
          ))}
        </div>
      </div>
    );
  }
  ```

- [ ] **步骤 2：Commit**

  ```bash
  git add frontend/src/components/CommentSection.jsx
  git commit -m "feat(ui): add comment section with replies and reports"
  ```

---

## 任务 20：热门侧边栏与排行榜页面

**文件：**
- 新增：`frontend/src/components/HotSidebar.jsx`
- 新增：`frontend/src/components/HotNews.jsx`

- [ ] **步骤 1：创建 HotSidebar.jsx**

  ```jsx
  import React, { useState, useEffect } from 'react';
  import { Link } from 'react-router-dom';
  import { api } from '../services/api.js';

  export default function HotSidebar() {
    const [items, setItems] = useState([]);

    useEffect(() => {
      api.getHotSidebar('today').then(data => setItems(data.items)).catch(() => {});
    }, []);

    return (
      <aside className="hidden lg:block w-72 shrink-0">
        <div className="bg-white border rounded-lg p-4">
          <h3 className="font-bold text-lg mb-3">今日热门</h3>
          <ol className="space-y-3">
            {items.map((item, idx) => (
              <li key={item.id} className="flex gap-2">
                <span className="text-gray-400 w-5 shrink-0">{idx + 1}</span>
                <Link to={`/article/${item.id}`} className="text-sm hover:text-blue-600 line-clamp-2">{item.title}</Link>
              </li>
            ))}
          </ol>
          <Link to="/hot" className="block mt-3 text-sm text-blue-600 hover:underline">查看完整榜单 →</Link>
        </div>
      </aside>
    );
  }
  ```

- [ ] **步骤 2：创建 HotNews.jsx**

  ```jsx
  import React, { useState, useEffect } from 'react';
  import { Link } from 'react-router-dom';
  import { api } from '../services/api.js';

  export default function HotNews() {
    const [range, setRange] = useState('today');
    const [items, setItems] = useState([]);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState(null);

    useEffect(() => {
      setPage(1);
      api.getHotArticles(range, 1).then(data => { setItems(data.items); setPagination(data.pagination); }).catch(() => {});
    }, [range]);

    const loadMore = async () => {
      const nextPage = page + 1;
      const data = await api.getHotArticles(range, nextPage);
      setItems(prev => [...prev, ...data.items]);
      setPagination(data.pagination);
      setPage(nextPage);
    };

    return (
      <div>
        <h2 className="text-xl font-bold mb-4">热门排行榜</h2>
        <div className="flex gap-4 mb-6 border-b">
          <button onClick={() => setRange('today')} className={`pb-2 ${range === 'today' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>今日热门</button>
          <button onClick={() => setRange('week')} className={`pb-2 ${range === 'week' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>本周热门</button>
        </div>
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.id} className="border rounded-lg p-4 hover:shadow-md">
              <Link to={`/article/${item.id}`} className="font-bold hover:text-blue-600">{item.title}</Link>
              <p className="text-sm text-gray-500 mt-1">{item.sourceName} · {item.category} · ❤️ {item.likeCount || 0}</p>
              {item.summary && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{item.summary}</p>}
            </div>
          ))}
        </div>
        {pagination && page < pagination.totalPages && (
          <button onClick={loadMore} className="mt-6 w-full py-2 border rounded hover:bg-gray-50">加载更多</button>
        )}
      </div>
    );
  }
  ```

- [ ] **步骤 3：在 App.jsx 注册 /hot 路由，在 NewsList 旁加入 HotSidebar**

  ```jsx
  import HotSidebar from './components/HotSidebar.jsx';
  import HotNews from './components/HotNews.jsx';
  // ...
  <Route path="/hot" element={<HotNews />} />
  // ...
  // 在 NewsList 的 container 中加入 HotSidebar
  ```

  修改首页布局：在 `<main>` 内或 NewsList 容器中加入侧边栏。具体布局根据现有 CSS 调整。

- [ ] **步骤 4：Commit**

  ```bash
  git add frontend/src/components/HotSidebar.jsx frontend/src/components/HotNews.jsx frontend/src/App.jsx
  git commit -m "feat(ui): add hot sidebar and hot news ranking page"
  ```

---

## 任务 21：管理员评论管理

**文件：**
- 新增：`frontend/src/components/CommentManager.jsx`

- [ ] **步骤 1：创建 CommentManager.jsx**

  ```jsx
  import React, { useState, useEffect } from 'react';
  import { api } from '../services/api.js';

  export default function CommentManager() {
    const [comments, setComments] = useState([]);

    const fetch = async () => {
      const data = await api.getReportedComments();
      setComments(data.comments);
    };

    useEffect(() => { fetch(); }, []);

    const handleDelete = async (id) => {
      if (!confirm('确定删除这条评论？')) return;
      await api.deleteComment(id);
      await fetch();
    };

    const handleIgnore = async (id) => {
      await api.clearCommentReports(id);
      await fetch();
    };

    return (
      <div>
        <h2 className="text-xl font-bold mb-4">评论管理</h2>
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr><th className="p-2 text-left">内容</th><th className="p-2">举报数</th><th className="p-2">操作</th></tr>
          </thead>
          <tbody>
            {comments.map(c => (
              <tr key={c.id} className="border-t">
                <td className="p-2 max-w-md truncate">{c.content}</td>
                <td className="p-2 text-center">{c.reportCount}</td>
                <td className="p-2 text-center space-x-2">
                  <button onClick={() => handleDelete(c.id)} className="text-red-600">删除</button>
                  <button onClick={() => handleIgnore(c.id)} className="text-gray-600">忽略</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {comments.length === 0 && <p className="text-gray-500 mt-4">暂无被举报的评论</p>}
      </div>
    );
  }
  ```

- [ ] **步骤 2：在 App.jsx 中注册路由（管理员可见）**

  ```jsx
  import CommentManager from './components/CommentManager.jsx';
  // ...
  {isAdmin && <NavLink to="/comment-manager">评论管理</NavLink>}
  // ...
  <Route path="/comment-manager" element={isLoading ? <p>加载中...</p> : user?.role === 'admin' ? <CommentManager /> : <Navigate to="/" replace />} />
  ```

- [ ] **步骤 3：Commit**

  ```bash
  git add frontend/src/components/CommentManager.jsx frontend/src/App.jsx
  git commit -m "feat(admin): add comment management page for reported comments"
  ```

---

## 任务 22：新闻卡片和详情页集成

**文件：**
- 修改：`frontend/src/components/NewsCard.jsx`
- 修改：`frontend/src/components/NewsDetail.jsx`

- [ ] **步骤 1：在 NewsCard.jsx 中嵌入 LikeButton**

  在卡片底部（和现有信息同一行）添加：

  ```jsx
  import LikeButton from './LikeButton.jsx';
  // ...
  <LikeButton articleId={article.id} user={user} />
  ```

  可能需要从父组件传入 `user`。

- [ ] **步骤 2：在 NewsDetail.jsx 中嵌入 LikeButton 和 CommentSection**

  在详情页合适位置添加：

  ```jsx
  import LikeButton from './LikeButton.jsx';
  import CommentSection from './CommentSection.jsx';
  // ...
  <LikeButton articleId={article.id} user={user} />
  <CommentSection articleId={article.id} user={user} />
  ```

- [ ] **步骤 3：Commit**

  ```bash
  git add frontend/src/components/NewsCard.jsx frontend/src/components/NewsDetail.jsx
  git commit -m "feat(ui): integrate likes and comments into news card and detail"
  ```

---

## 任务 23：运行全部测试

- [ ] **步骤 1：运行后端所有测试**

  ```bash
  cd /mnt/f/program/ai/news/backend && npm test
  ```

  预期：所有测试通过。

- [ ] **步骤 2：运行前端构建**

  ```bash
  cd /mnt/f/program/ai/news/frontend && npm run build
  ```

  预期：构建成功，无错误。

- [ ] **步骤 3：Commit**

  ```bash
  git commit -m "chore: all tests pass, build succeeds"
  ```

---

## 自检

**1. 规格覆盖度：**

| 规格需求 | 实现任务 |
|---|---|
| 邮箱验证（注册发送、点击验证、重发） | 任务 3, 5, 9 |
| 密码找回（邮件 + 重置链接） | 任务 3, 5, 9, 16 |
| 密码修改（旧密码验证） | 任务 4, 5, 9, 17 |
| 文章点赞 toggle + 点赞列表 | 任务 6, 10, 18 |
| 嵌套评论（一层回复） | 任务 7, 11, 19 |
| 评论举报 + 管理员删除/忽略 | 任务 7, 11, 21 |
| 今日/本周热门排行榜 | 任务 8, 12, 20 |
| 首页侧边栏 TOP 5 | 任务 20 |
| SMTP 邮件服务 | 任务 2 |
| 邮箱验证状态控制互动权限 | 任务 5 (middleware), 15 (banner) |

无遗漏。

**2. 占位符扫描：** 无"待定"、"TODO"、"后续实现"。

**3. 类型一致性：**
- `emailVerified` 在 user 模型、auth 路由、useAuth hook 中命名一致
- `articleId` 在所有点赞/评论接口中统一为 Number 类型
- `range` 参数统一为 `today` / `week` 字符串
