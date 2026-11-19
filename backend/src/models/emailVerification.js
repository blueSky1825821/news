import { getDb } from '../db.js';
import { randomBytes } from 'node:crypto';

export function createVerificationToken(userId) {
  const db = getDb();
  const token = randomBytes(32).toString('hex');
  const stmt = db.prepare(`
    INSERT INTO email_verification_tokens (userId, token, expiresAt)
    VALUES (?, ?, datetime('now', '+24 hours'))
  `);
  stmt.run(userId, token);
  return token;
}

export function findVerificationToken(token) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM email_verification_tokens
    WHERE token = ? AND usedAt IS NULL AND expiresAt > datetime('now')
  `);
  return stmt.get(token) || null;
}

export function markVerificationTokenUsed(token) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE email_verification_tokens
    SET usedAt = datetime('now')
    WHERE token = ?
  `);
  stmt.run(token);
}

export function deleteUserVerificationTokens(userId) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM email_verification_tokens WHERE userId = ?');
  stmt.run(userId);
}
