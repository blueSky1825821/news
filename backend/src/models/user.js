import { getDb } from '../db.js';
import { randomUUID, randomBytes } from 'node:crypto';

export function findOrCreateWechatUser(appId, openId) {
  const db = getDb();
  const existing = db.prepare('SELECT userId FROM wechat_users WHERE appId = ? AND openId = ?').get(appId, openId);
  if (existing) return findUserById(existing.userId);
  db.exec('BEGIN IMMEDIATE');
  try {
    const userId = createUser({ email: `${randomUUID()}@wechat.invalid`, passwordHash: randomBytes(48).toString('hex') });
    db.prepare('INSERT INTO wechat_users (appId, openId, userId) VALUES (?, ?, ?)').run(appId, openId, userId);
    db.exec('COMMIT');
    return findUserById(userId);
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function isWechatUser(userId) {
  return !!getDb().prepare('SELECT 1 FROM wechat_users WHERE userId = ?').get(userId);
}

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
  const stmt = db.prepare('SELECT id, email, passwordHash, emailVerified, createdAt, updatedAt FROM users WHERE id = ?');
  return stmt.get(id) || null;
}

export function updateUserPassword(userId, passwordHash) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE users
    SET passwordHash = ?, updatedAt = datetime('now')
    WHERE id = ?
  `);
  stmt.run(passwordHash, userId);
}

export function setEmailVerified(userId) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE users
    SET emailVerified = 1, updatedAt = datetime('now')
    WHERE id = ?
  `);
  stmt.run(userId);
}
