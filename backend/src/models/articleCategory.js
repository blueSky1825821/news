import { getDb } from '../db.js';

export function getArticleCategories(articleId) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT categoryName FROM article_categories WHERE articleId = ? ORDER BY categoryName
  `);
  return stmt.all(articleId).map((row) => row.categoryName);
}

export function setArticleCategories(articleId, categoryNames) {
  const db = getDb();
  const deleteStmt = db.prepare('DELETE FROM article_categories WHERE articleId = ?');
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO article_categories (articleId, categoryName)
    VALUES (?, ?)
  `);

  db.exec('BEGIN');
  try {
    deleteStmt.run(articleId);
    for (const name of categoryNames) {
      insertStmt.run(articleId, name);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getArticleCategories(articleId);
}

export function findArticleIdsByCategory(categoryName) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT articleId FROM article_categories WHERE categoryName = ? ORDER BY articleId DESC
  `);
  return stmt.all(categoryName).map((row) => row.articleId);
}
