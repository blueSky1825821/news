import { getDb } from '../db.js';

export function insertArticle({ title, summary, content, originalUrl, sourceId, publishedAt }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO articles (title, summary, content, originalUrl, sourceId, publishedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(title, summary || null, content || null, originalUrl, sourceId, publishedAt || null);
  return result.lastInsertRowid || null;
}

export function getArticleById(id) {
  const db = getDb();
  const row = db.prepare(`
    SELECT a.*, s.name as sourceName, s.category
    FROM articles a
    JOIN sources s ON a.sourceId = s.id
    WHERE a.id = ?
  `).get(id);
  return row || null;
}

export function getRecentArticles(limit = 10, hours = 24) {
  const db = getDb();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const stmt = db.prepare(`
    SELECT a.*, s.name as sourceName, s.category
    FROM articles a
    JOIN sources s ON a.sourceId = s.id
    WHERE a.fetchedAt >= ?
    ORDER BY a.publishedAt DESC, a.id DESC
    LIMIT ?
  `);
  return stmt.all(since, limit);
}

export function listArticles({ page = 1, limit = 20, sourceId, category } = {}) {
  const db = getDb();
  const offset = (page - 1) * limit;
  const maxLimit = Math.min(limit, 100);

  const conditions = [];
  const params = [];

  if (sourceId) {
    conditions.push('a.sourceId = ?');
    params.push(sourceId);
  }
  if (category) {
    conditions.push('s.category = ?');
    params.push(category);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countStmt = db.prepare(`
    SELECT COUNT(*) as total FROM articles a
    JOIN sources s ON a.sourceId = s.id
    ${whereClause}
  `);
  const { total } = countStmt.get(...params);

  const dataStmt = db.prepare(`
    SELECT a.*, s.name as sourceName, s.category
    FROM articles a
    JOIN sources s ON a.sourceId = s.id
    ${whereClause}
    ORDER BY a.publishedAt DESC, a.id DESC
    LIMIT ? OFFSET ?
  `);
  const items = dataStmt.all(...params, maxLimit, offset);

  return {
    items,
    pagination: {
      page,
      limit: maxLimit,
      total,
      totalPages: Math.ceil(total / maxLimit)
    }
  };
}

export function cleanupOldArticles(beforeDate) {
  const db = getDb();
  const stmt = db.prepare(`
    DELETE FROM articles
    WHERE fetchedAt < datetime(?)
      AND NOT EXISTS (
        SELECT 1 FROM article_flags WHERE articleId = articles.id
      )
  `);
  const result = stmt.run(beforeDate);
  return result.changes;
}
