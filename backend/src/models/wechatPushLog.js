import { getDb } from '../db.js';

export function logPush({ articleId = null, pushType, status, wxMessageId = null, errorMessage = null }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO wechat_push_logs (articleId, pushType, status, wxMessageId, errorMessage)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(articleId, pushType, status, wxMessageId, errorMessage);
}

export function listPushLogs({ limit = 50 } = {}) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM wechat_push_logs ORDER BY createdAt DESC LIMIT ?
  `);
  return stmt.all(limit);
}
