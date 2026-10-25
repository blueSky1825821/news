import { getDb } from '../db.js';

export function flagArticle(articleId, flaggedBy = 'system') {
  const db = getDb();
  const stmt = db.prepare('INSERT OR IGNORE INTO article_flags (articleId, flaggedBy) VALUES (?, ?)');
  stmt.run(articleId, flaggedBy);
}

export function unflagArticle(articleId) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM article_flags WHERE articleId = ?');
  stmt.run(articleId);
}

export function isFlagged(articleId) {
  const db = getDb();
  const stmt = db.prepare('SELECT 1 FROM article_flags WHERE articleId = ?');
  return !!stmt.get(articleId);
}

export function listFlaggedArticleIds() {
  const db = getDb();
  const stmt = db.prepare('SELECT articleId FROM article_flags ORDER BY createdAt DESC');
  return stmt.all().map((r) => r.articleId);
}
