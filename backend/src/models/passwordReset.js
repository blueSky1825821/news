import { getDb, withWriteTransaction } from '../db.js';
import { updateUserPassword } from './user.js';
import { randomBytes } from 'node:crypto';

export function createPasswordResetToken(userId) {
  const db = getDb();
  const token = randomBytes(32).toString('hex');
  const stmt = db.prepare(`
    INSERT INTO password_reset_tokens (userId, token, expiresAt)
    VALUES (?, ?, datetime('now', '+24 hours'))
  `);
  stmt.run(userId, token);
  return token;
}

export function findPasswordResetToken(token) {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT * FROM password_reset_tokens
    WHERE token = ? AND usedAt IS NULL AND expiresAt > datetime('now')
  `);
  return stmt.get(token) || null;
}

export function invalidatePasswordResetTokens(userId) {
  getDb().prepare(`
    UPDATE password_reset_tokens SET usedAt = datetime('now')
    WHERE userId = ? AND usedAt IS NULL
  `).run(userId);
}

export function resetPasswordWithToken(token, passwordHash) {
  return withWriteTransaction(() => {
    const record = findPasswordResetToken(token);
    if (!record) return false;

    updateUserPassword(record.userId, passwordHash);
    invalidatePasswordResetTokens(record.userId);
    return true;
  });
}
