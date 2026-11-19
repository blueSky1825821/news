# 个人信息设置页面设计规格

> **日期：** 2026-11-19  
> **功能：** 用户个人信息设置（昵称、简介、头像上传）

---

## 目标

为已登录用户提供个人信息设置功能，包含昵称、个人简介和头像上传。将现有 `/settings` 页面重构为标签页导航结构，分离"个人信息"与"播报设置"。

## 架构概述

- **后端**：在 `users` 表扩展三个字段（`displayName`, `bio`, `avatarUrl`）；新增 `/api/users/profile` 和 `/api/users/avatar` 路由；使用 `multer` 处理头像上传，文件存储于服务器本地 `public/uploads/avatars/`。
- **前端**：新建 `SettingsPage` 作为 `/settings` 入口，内含侧边栏导航切换 "个人信息" 与 "播报设置"；新建 `ProfileSettings` 组件处理表单和头像上传；重构 `TtsSettings` 为纯播报设置。

## 数据库模型

在 `users` 表增加以下字段（通过 `ALTER TABLE` 迁移）：

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `displayName` | TEXT | 可为空 | 用户昵称，最大 50 字符 |
| `bio` | TEXT | 可为空 | 个人简介，最大 200 字符 |
| `avatarUrl` | TEXT | 可为空 | 头像文件相对路径，如 `/uploads/avatars/123-xxx.png` |

```sql
ALTER TABLE users ADD COLUMN displayName TEXT;
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN avatarUrl TEXT;
```

## 后端 API

### 1. GET /api/users/profile

获取当前登录用户的完整个人资料。

**认证：** 需要 `authMiddleware`

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "user": {
      "id": 1,
      "email": "user@example.com",
      "displayName": "小明",
      "bio": "AI 新闻爱好者",
      "avatarUrl": "/uploads/avatars/1-1234567890.png",
      "role": "user",
      "categories": ["AI", "科技"],
      "emailVerified": true
    }
  }
}
```

### 2. PUT /api/users/profile

更新昵称和/或简介。

**认证：** 需要 `authMiddleware`

**请求体：**
```json
{
  "displayName": "小明",
  "bio": "AI 新闻爱好者"
}
```

**校验规则：**
- `displayName`：字符串，去掉首尾空格后 ≤ 50 字符，可为空
- `bio`：字符串，去掉首尾空格后 ≤ 200 字符，可为空

**响应：** 返回更新后的完整用户对象（同 GET 接口格式）

**错误码：**
- `displayName` 超过 50 字符 → 400，code = 1030
- `bio` 超过 200 字符 → 400，code = 1031

### 3. POST /api/users/avatar

上传头像图片。

**认证：** 需要 `authMiddleware`

**请求格式：** `multipart/form-data`，字段名 `avatar`

**文件限制：**
- 大小：≤ 2MB
- 格式：`image/jpeg`, `image/png`, `image/gif`, `image/webp`

**文件存储：**
- 路径：`backend/public/uploads/avatars/`
- 文件名：`avatar-{userId}-{timestamp}.{ext}`（timestamp 为 Date.now()）
- 如用户已有旧头像，上传新头像后删除旧文件（防止磁盘膨胀）

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "avatarUrl": "/uploads/avatars/avatar-1-1234567890.png"
  }
}
```

**错误码：**
- 未上传文件 → 400，code = 1032
- 文件过大或格式不符 → 400，code = 1033

### 4. 扩展 GET /api/auth/me

在现有 `/api/auth/me` 返回的 `user` 对象中追加 `displayName`、`bio`、`avatarUrl` 字段，确保前端各处的用户信息一致。

### 静态文件服务

在 `app.js` 中注册（必须在 `/news` 前端静态服务之前）：

```js
const uploadsPath = path.join(__dirname, '../public/uploads');
app.use('/uploads', express.static(uploadsPath));
app.use('/news/uploads', express.static(uploadsPath));
```

## 前端组件

### SettingsPage.jsx（新建）

`/settings` 路由的新入口组件。

- 左侧边栏：两个导航项
  - "个人信息"（默认选中）
  - "播报设置"
- 右侧内容区：根据当前选中项渲染对应组件
- 使用内部 React state 管理当前标签（非 URL 路由），简化实现

### ProfileSettings.jsx（新建）

个人信息编辑表单。

**UI 结构：**
```
个人信息
├── 头像区域（点击上传）
│   ├── 当前头像（圆形，fallback 为默认图标）
│   └── 悬浮提示"点击更换头像"
├── 昵称
│   └── <input>，placeholder "请输入昵称"
├── 简介
│   └── <textarea>，rows=3，placeholder "介绍一下你自己"
├── 邮箱（只读）
│   └── 显示当前邮箱，不可编辑
└── [保存按钮]
```

**行为：**
- 从 `useAuth().user` 读取初始值
- 昵称实时字数计数（0/50）
- 简介实时字数计数（0/200）
- 点击头像区域唤起 `<input type="file" accept="image/*">`
- 选择图片后 `FileReader` 生成预览（不立即上传）
- 点击"保存"时：
  1. 如有新选文件，先 `api.uploadAvatar(file)` 获取 `avatarUrl`
  2. 再 `api.updateProfile({ displayName, bio, avatarUrl })`
  3. 成功后调用 `useAuth().updateProfile` 更新全局用户状态
  4. 显示成功提示

### TtsSettings.jsx（重构）

从当前的混合页面拆分为纯播报设置组件。

**保留内容：**
- 语速滑块
- 音调滑块
- 播报嗓音选择
- 默认播报模式切换

**移除内容：**
- 密码修改表单（移到 ProfileSettings）
- UserSettings 兴趣分类（移到 ProfileSettings）
- `user`、`onUpdateCategories`、`changePassword` 相关逻辑

### useAuth.js（扩展）

新增 `updateProfile(profile)` 方法：

```js
const updateProfile = useCallback(async (profile) => {
  const data = await api.updateProfile(profile);
  const updated = { ...user, ...data.user };
  setUser(updated);
  setStoredUser(updated);
  return updated;
}, [user]);
```

### App.jsx（调整）

- `/settings` 路由渲染 `SettingsPage` 而非 `TtsSettings`
- Navbar 显示的用户名逻辑更新：
  - 优先 `user.displayName`
  - 次选 `user.email`（取 `@` 前部分）
  - 微信用户未设置时 fallback 为"微信用户"

### api.js（扩展）

新增方法：

```js
getProfile() {
  return request('/api/users/profile');
},
updateProfile(profile) {
  return request('/api/users/profile', {
    method: 'PUT',
    body: JSON.stringify(profile)
  });
},
uploadAvatar(file) {
  const formData = new FormData();
  formData.append('avatar', file);
  return request('/api/users/avatar', {
    method: 'POST',
    body: formData,
    headers: {} // 让浏览器自动设置 Content-Type with boundary
  });
}
```

**注意：** `uploadAvatar` 的 `Content-Type` 必须交由浏览器自动设置（multipart boundary），因此 `api.request` 需要支持在 headers 为空对象时不覆盖。

## 全局显示名 Fallback 策略

所有显示用户名称的位置统一使用以下优先级：

1. `user.displayName`（用户自定义昵称）
2. `user.email.split('@')[0]`（邮箱前缀）
3. `isWechatUser ? '微信用户' : '未知用户'`

需要修改的位置：
- `auth.js` 中 `/register`、`/login`、`/me` 的返回
- `Navbar` 组件中的用户名显示
- `LikeUsersModal` 中的用户列表
- `CommentSection` 中的评论作者名

## 错误处理

| 场景 | 前端 | 后端 |
|------|------|------|
| 昵称 > 50 字符 | 实时阻止输入，显示计数 | 400，code = 1030 |
| 简介 > 200 字符 | 实时阻止输入，显示计数 | 400，code = 1031 |
| 头像 > 2MB | 选择时前端提示 | multer 拒绝，400 code = 1033 |
| 头像非图片格式 | accept 属性过滤 | multer 过滤，400 code = 1033 |
| 未登录访问 /settings | 重定向到 /login | authMiddleware 401 |
| 旧头像文件不存在 | 静默忽略（删除失败不打断流程）| — |

## 测试策略

### 后端测试

- `GET /api/users/profile` — 返回正确用户信息（含新字段）
- `PUT /api/users/profile` — 更新昵称/简介成功，验证长度限制
- `POST /api/users/avatar` — 上传图片成功，文件保存正确
- `POST /api/users/avatar` — 拒绝过大文件/非图片格式
- `GET /api/auth/me` — 返回包含新字段的 user 对象

### 前端测试

- `ProfileSettings` 渲染初始值正确
- 表单提交调用正确 API
- 头像选择后预览正确
- 字数限制实时生效

## 文件变更清单

**新建：**
- `backend/src/routes/users.js`
- `frontend/src/components/SettingsPage.jsx`
- `frontend/src/components/ProfileSettings.jsx`

**修改：**
- `backend/src/db.js` — 添加用户表字段迁移
- `backend/src/models/user.js` — 新增 `updateUserProfile`、`getUserProfile`
- `backend/src/app.js` — 注册 users 路由和静态文件服务
- `backend/src/routes/auth.js` — `/me`, `/register`, `/login` 返回新字段
- `backend/src/middleware/auth.js` — `getUserRole` 不再需要 `isWechatUser` 决定 displayName
- `frontend/src/App.jsx` — `/settings` 路由改为 SettingsPage，Navbar 显示名逻辑
- `frontend/src/hooks/useAuth.js` — 新增 `updateProfile`
- `frontend/src/services/api.js` — 新增 profile/avatar API
- `frontend/src/components/TtsSettings.jsx` — 拆分为纯播报设置
- `frontend/src/components/NewsCard.jsx` — LikeButton 的显示名（如有影响）
- `frontend/src/components/LikeUsersModal.jsx` — 用户列表显示名
- `frontend/src/components/CommentSection.jsx` — 评论作者显示名

**新增依赖：**
- `backend/package.json` — `multer`（文件上传中间件）
