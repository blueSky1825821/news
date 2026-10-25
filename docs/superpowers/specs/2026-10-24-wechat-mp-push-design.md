# 微信公众号推送功能设计

## 概述

为新闻头条播报系统增加微信公众号推送能力：
- **定时汇总推送**：每天早上 8:00 自动推送过去 24 小时的新文章汇总
- **用户标记重要**：用户在新闻列表中标记文章为"重要"，被标记文章在汇总中优先展示
- **手动预览推送**：管理员可将单篇文章推送到指定微信号预览，在公众号后台决定是否群发

**约束**：使用个人订阅号，受限于微信平台规则（每天仅能群发 1 次）。

---

## 架构

### 新增模块

```
backend/
  src/
    models/
      wechatSettings.js       -- 公众号配置读写
      wechatPushLog.js        -- 推送记录
      articleFlag.js          -- 用户标记的重要文章
    routes/
      wechat.js               -- 配置查询/更新、手动推送、标记重要
    services/
      wechat.js               -- 微信 API 封装（access_token、群发、预览）
    services/
      scheduler.js            -- 新增定时推送任务（早 8:00）
frontend/
  src/
    components/
      NewsCard.jsx            -- 增加"标记重要"按钮
      NewsDetail.jsx          -- 增加"标记重要"按钮
      WechatSettings.jsx      -- 公众号配置页面（管理员）
```

### 数据库表

```sql
-- 公众号配置
CREATE TABLE IF NOT EXISTS wechat_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  appId TEXT NOT NULL,
  appSecret TEXT NOT NULL,
  accessToken TEXT,
  tokenExpiresAt DATETIME,
  previewOpenId TEXT,           -- 预览推送目标微信号
  summaryPushCron TEXT NOT NULL DEFAULT '0 8 * * *',
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 推送记录
CREATE TABLE IF NOT EXISTS wechat_push_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  articleId INTEGER,
  pushType TEXT NOT NULL,       -- 'summary' | 'preview' | 'manual'
  status TEXT NOT NULL,         -- 'pending' | 'success' | 'failed'
  wxMessageId TEXT,             -- 微信返回的消息 ID
  errorMessage TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 用户标记的重要文章
CREATE TABLE IF NOT EXISTS article_flags (
  articleId INTEGER PRIMARY KEY,
  flaggedBy TEXT NOT NULL DEFAULT 'system',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (articleId) REFERENCES articles(id) ON DELETE CASCADE
);
```

---

## 功能详细设计

### 1. 定时汇总推送

**触发条件**：`node-cron` 每天 08:00 执行（Asia/Shanghai 时区）。

**执行流程**：
1. 读取 `wechat_settings` 获取 `accessToken`（过期则刷新）。
2. 查询过去 24 小时内抓取的新文章：`fetchedAt >= datetime('now', '-1 day')`。
3. 查询 `article_flags` 获取被标记为重要的文章 ID，将这些文章排在列表最前面。
4. 组装图文消息：
   - 标题：`📰 每日新闻播报 | YYYY-MM-DD（共 N 篇）`
   - 封面：第一篇重要文章或最新文章的标题
   - 内容：文章标题列表，每篇附带原文链接
5. 调用微信公众号**群发接口** `POST https://api.weixin.qq.com/cgi-bin/message/mass/sendall`。
6. 写入 `wechat_push_logs`，记录推送状态。

**降级处理**：
- 如果当天已群发过（微信返回 45009），则跳过并记录日志。
- 如果没有新文章，则不发送空消息。
- 如果 access_token 获取失败，重试 3 次后记录错误并跳过。

### 2. 用户标记重要

**交互**：
- 在 `NewsCard` 和 `NewsDetail` 中增加星形图标按钮。
- 点击后调用 `POST /api/wechat/flag`。
- 已标记的文章显示实心星形，未标记显示空心星形。

**后端逻辑**：
- `flagArticle(articleId)`：插入 `article_flags`，幂等（ON CONFLICT IGNORE）。
- `unflagArticle(articleId)`：删除 `article_flags` 记录。
- `isFlagged(articleId)`：查询是否存在。

**权限**：当前系统为单用户模式，无需鉴权。预留多用户扩展性（`flaggedBy` 字段）。

### 3. 手动预览推送

**交互**：
- 在 `NewsDetail` 中增加"推送到公众号预览"按钮（仅管理员可见）。
- 点击后调用 `POST /api/wechat/preview`。

**后端逻辑**：
1. 读取 `wechat_settings.previewOpenId`。
2. 组装单篇图文消息（标题、摘要、原文链接）。
3. 调用微信公众号**预览接口** `POST https://api.weixin.qq.com/cgi-bin/message/mass/preview`。
4. 目标微信号收到预览消息，管理员可在公众号后台决定是否群发。

### 4. 公众号配置管理

**页面**：`WechatSettings.jsx`（路由 `/wechat-settings`）。

**可配置项**：
- AppID
- AppSecret
- 预览目标微信号（OpenID）
- 定时推送开关
- 定时推送时间（Cron 表达式，默认 `0 8 * * *`）

**安全**：AppSecret 存储为明文（本系统为单用户自用，不对外暴露）。

---

## 错误处理

| 场景 | 处理 |
|------|------|
| 微信 API 返回 access_token 失效 | 自动刷新并重试 |
| 当天已群发过（errcode 45009） | 记录日志，跳过本次推送 |
| 预览目标 OpenID 未设置 | 返回 400 错误，提示用户配置 |
| 网络超时 | 重试 3 次，指数退避 |
| 组装消息时文章缺失 | 跳过该文章，继续组装其余 |

---

## 测试计划

1. **单元测试**：`wechat.js` service 的 access_token 刷新逻辑、消息组装逻辑。
2. **集成测试**：模拟微信 API 响应，验证群发和预览流程。
3. **手动测试**：配置真实公众号 AppID/AppSecret，验证预览消息能否收到。

---

## 未来扩展

- 如果后续升级为企业服务号，可替换为模板消息实现真正的实时推送。
- 增加用户分类订阅：用户在公众号菜单中选择分类，汇总只包含该分类文章。
