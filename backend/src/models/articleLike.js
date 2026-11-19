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
    SELECT u.id, u.displayName, u.email
    FROM article_likes al
    JOIN users u ON al.userId = u.id
    WHERE al.articleId = ?
    ORDER BY al.createdAt DESC
    LIMIT ? OFFSET ?
  `).all(articleId, limit, offset);
  const { count } = db.prepare(`SELECT COUNT(*) as count FROM article_likes WHERE articleId = ?`).get(articleId);
  return { users, total: count };
}
