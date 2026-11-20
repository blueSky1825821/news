import { getDb } from '../db.js';

const sourceJoin = 'JOIN sources s ON a.sourceId = s.id';
const cardFields = 'a.id, a.title, a.summary, a.originalUrl, a.sourceId, a.publishedAt';
const likeFields = `,
  (SELECT COUNT(*) FROM article_likes WHERE articleId = a.id) AS likeCount,
  EXISTS(SELECT 1 FROM article_likes WHERE userId = ? AND articleId = a.id) AS liked
`;

function pagination(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

export function insertArticle({ title, summary, content, originalUrl, sourceId, publishedAt, transcript, headlines }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO articles (title, summary, content, originalUrl, sourceId, publishedAt, transcript, headlines)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(title, summary || null, content || null, originalUrl, sourceId, publishedAt || null, transcript || null, headlines || null);
  return result.changes > 0 ? result.lastInsertRowid : null;
}

export function getArticleById(id, { includeLikes = false, viewerId = null } = {}) {
  const db = getDb();
  const row = db.prepare(`
    SELECT a.*, s.name as sourceName, s.category ${includeLikes ? likeFields : ''}
    FROM articles a
    ${sourceJoin}
    WHERE a.id = ?
  `).get(...(includeLikes ? [viewerId, id] : [id]));
  return row ? (includeLikes ? { ...row, liked: Boolean(row.liked) } : row) : null;
}

export function getRecentArticles(limit = 10, hours = 24) {
  const db = getDb();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const stmt = db.prepare(`
    SELECT a.*, s.name as sourceName, s.category
    FROM articles a
    JOIN sources s ON a.sourceId = s.id
    WHERE datetime(a.fetchedAt) >= datetime(?)
    ORDER BY a.publishedAt DESC, a.id DESC
    LIMIT ?
  `);
  return stmt.all(since, limit);
}

export function listRecentArticles({ page, limit, cards, viewerId = null }) {
  const db = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const maxTotal = 1000;
  const where = 'WHERE datetime(a.fetchedAt) >= datetime(?)';
  const { total } = db.prepare(`
    SELECT COUNT(*) AS total FROM (
      SELECT 1 FROM articles a ${sourceJoin} ${where} LIMIT ?
    )
  `).get(since, maxTotal);
  const offset = (page - 1) * limit;
  const items = offset >= total ? [] : queryPage({ cards, viewerId, where,
    filters: [since], limit: Math.min(limit, total - offset), offset
  });
  return { items, pagination: pagination(page, limit, total) };
}

function queryPage({ cards, viewerId, where, filters, limit, offset }) {
  const items = getDb().prepare(`
    SELECT ${cards ? cardFields : 'a.*'}, s.name as sourceName, s.category ${cards ? likeFields : ''}
    FROM articles a
    ${sourceJoin}
    ${where}
    ORDER BY a.publishedAt DESC, a.id DESC
    LIMIT ? OFFSET ?
  `).all(...(cards ? [viewerId] : []), ...filters, limit, offset);
  return cards ? items.map(item => ({ ...item, liked: Boolean(item.liked) })) : items;
}

export function listArticles({ page = 1, limit = 20, sourceId, category, cards, viewerId = null } = {}) {
  const db = getDb();
  const maxLimit = Math.min(limit, 100);
  const offset = (page - 1) * maxLimit;

  const conditions = [];
  const params = [];

  if (sourceId) {
    conditions.push('a.sourceId = ?');
    params.push(sourceId);
  }
  const categories = Array.isArray(category) ? category : [category].filter(Boolean);
  if (categories.length > 0) {
    conditions.push(`s.category IN (${categories.map(() => '?').join(', ')})`);
    params.push(...categories);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countStmt = db.prepare(`
    SELECT COUNT(*) as total FROM articles a
    JOIN sources s ON a.sourceId = s.id
    ${whereClause}
  `);
  const { total } = countStmt.get(...params);

  const items = offset >= total ? [] : queryPage({ cards, viewerId, where: whereClause,
    filters: params, limit: maxLimit, offset
  });
  return { items, pagination: pagination(page, maxLimit, total) };
}

export function listHotArticles({ range, page, limit, cards, includeTotal = true }) {
  const db = getDb();
  const now = new Date();
  const since = range === 'week'
    ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const cutoff = since.toISOString();
  const where = 'WHERE datetime(a.publishedAt) >= datetime(?)';
  const offset = (page - 1) * limit;

  const total = includeTotal ? db.prepare(`
    SELECT COUNT(*) AS total FROM articles a ${sourceJoin} ${where}
  `).get(cutoff).total : null;

  const items = total !== null && offset >= total ? [] : db.prepare(`
    WITH ranked AS (
      SELECT a.id, a.publishedAt,
        (SELECT COUNT(*) FROM article_likes WHERE articleId = a.id) AS likeCount
      FROM articles a
      ${sourceJoin}
      ${where}
      ORDER BY likeCount DESC, a.publishedAt DESC, a.id DESC
      LIMIT ? OFFSET ?
    )
    SELECT ${cards ? cardFields : 'a.*'}, s.name AS sourceName, s.category, r.likeCount
    FROM ranked r
    JOIN articles a ON a.id = r.id
    ${sourceJoin}
    ORDER BY r.likeCount DESC, r.publishedAt DESC, r.id DESC
  `).all(cutoff, limit, offset);

  return includeTotal ? { items, pagination: pagination(page, limit, total) } : { items };
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
