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
