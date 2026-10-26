# 定时清理旧新闻设计文档

## 背景与目标

新闻聚合系统持续抓取文章，数据库中的 `articles` 表会不断增长。为防止数据无限膨胀，需要引入自动清理机制：

- **每天零点**执行定时任务
- **硬删除**超过保留期限的旧文章
- **跳过被标记（flagged）的文章**，确保重要内容不被误删

## 需求澄清

| 问题 | 结论 |
|---|---|
| "旧"基于哪个时间字段？ | 基于 `fetchedAt`（系统抓取时间） |
| 保留多久？ | **90 天（3 个月）** |
| 是否跳过被标记文章？ | **是**，被标记文章永远保留 |
| 配置方式？ | 环境变量（`CLEANUP_ENABLED`、`CLEANUP_RETENTION_DAYS`） |

## 方案选择

考虑过三种方案：

1. **固定硬编码**：改动最小，但不可配置
2. **环境变量配置**：无需数据库变更，部署时即可配置；修改需重启生效
3. **数据库 settings 配置**：可动态调整，但改动更大

**最终选择方案 2（环境变量配置）**，在简单性和可配置性之间取得平衡。

## 架构设计

### 新增/修改的文件

| 文件 | 动作 | 职责 |
|---|---|---|
| `backend/src/models/article.js` | 新增函数 | `cleanupOldArticles(beforeDate)` — 执行硬删 SQL |
| `backend/src/services/scheduler.js` | 新增调度器 | `startCleanupScheduler()` / `stopCleanupScheduler()`，每日 00:00 触发 |
| `backend/src/server.js` | 调用启动 | 服务启动时调用 `startCleanupScheduler()` |
| `backend/src/routes/crawl.js` | 新增接口 | `POST /api/cleanup/trigger` — 手动触发清理（管理员调试用） |

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `CLEANUP_ENABLED` | `true` | 是否启用自动清理。设为 `false` 则不注册定时任务 |
| `CLEANUP_RETENTION_DAYS` | `90` | 保留天数，必须为正整数。非法值回退到默认值 |

## 数据流

### 自动清理流程

1. `startCleanupScheduler()` 读取环境变量：
   - 若 `CLEANUP_ENABLED === 'false'`，跳过注册，打印 `[Cleanup] Disabled.`
   - 解析 `CLEANUP_RETENTION_DAYS`，非法或缺失则取默认 `90`

2. 注册 cron 任务 `0 0 * * *`（每日 00:00，`Asia/Shanghai`）：
   - 执行 SQL：
     ```sql
     DELETE FROM articles
     WHERE fetchedAt < datetime('now', '-90 days')
       AND NOT EXISTS (
         SELECT 1 FROM article_flags WHERE articleId = articles.id
       )
     ```
   - `article_flags` 表已设置 `ON DELETE CASCADE`，被删除文章的标记记录自动级联清理

3. 控制台输出：`[Cleanup] Deleted N old articles.`

### 手动触发接口

- `POST /api/cleanup/trigger`
- 立即执行一次清理逻辑
- 返回 JSON：`{ deleted: N }`
- 用于管理员调试，不走定时任务队列

## 接口定义

### POST /api/cleanup/trigger

**请求：** 无 body

**成功响应：**
```json
{
  "code": 0,
  "message": "Cleanup finished",
  "data": {
    "deleted": 42
  }
}
```

**错误响应：** 统一走全局错误处理中间件

## 错误处理

| 场景 | 行为 |
|---|---|
| `CLEANUP_RETENTION_DAYS` 非法 | 打印警告，使用默认值 `90`，不阻断启动 |
| SQL 执行异常 | catch 并打印 `[Cleanup] Failed: <message>`，不抛出让服务崩溃 |
| 手动触发时异常 | 通过 `next(err)` 交给全局错误处理中间件 |

## 日志规范

```
[Cleanup] Scheduler started. Retention: 90 days.
[Cleanup] Deleted 42 old articles.
[Cleanup] Failed: <error message>
[Cleanup] Scheduler stopped.
```

## 测试策略

| 类型 | 内容 |
|---|---|
| 单元测试 | 模拟 `node-cron` 触发，验证 `cleanupOldArticles` 只删除超期且未被标记的文章 |
| 边界测试 | 保留天数为 `0`、负数、非法字符串时的回退行为；`CLEANUP_ENABLED=false` 时不注册任务 |
| 集成测试 | 通过 `POST /api/cleanup/trigger` 手动触发，验证数据库最终状态 |

## 风险与注意事项

1. **级联删除**：`article_flags` 的 `ON DELETE CASCADE` 会自动清理被删除文章的标记记录，这是预期行为
2. **时区**：cron 使用 `Asia/Shanghai`，确保零点执行符合国内习惯
3. **硬删除不可逆**：本设计为硬删除（非软删），执行前无二次确认，需确保保留天数设置合理
