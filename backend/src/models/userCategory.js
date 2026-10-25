import { getDb } from '../db.js';

export function getUserCategories(userId) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT categoryName FROM user_categories WHERE userId = ? ORDER BY categoryName
  `);
  return stmt.all(userId).map((row) => row.categoryName);
}

export function setUserCategories(userId, categoryNames) {
  const db = getDb();
  const deleteStmt = db.prepare('DELETE FROM user_categories WHERE userId = ?');
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO user_categories (userId, categoryName)
    VALUES (?, ?)
  `);

  db.exec('BEGIN');
  try {
    deleteStmt.run(userId);
    for (const name of categoryNames) {
      insertStmt.run(userId, name);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getUserCategories(userId);
}
