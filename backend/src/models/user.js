import { getDb } from '../db.js';

export function createUser({ email, passwordHash }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO users (email, passwordHash)
    VALUES (?, ?)
  `);
  const result = stmt.run(email, passwordHash);
  return result.lastInsertRowid;
}

export function findUserByEmail(email) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email) || null;
}

export function findUserById(id) {
  const db = getDb();
  const stmt = db.prepare('SELECT id, email, emailVerified, createdAt, updatedAt FROM users WHERE id = ?');
  return stmt.get(id) || null;
}
