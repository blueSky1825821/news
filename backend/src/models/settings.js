import { getDb } from '../db.js';

export const DEFAULT_FAILURE_THRESHOLD = 5;
export const FAILURE_THRESHOLD_KEY = 'failureThreshold';

export function getSetting(key, defaultValue = null) {
  const db = getDb();
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const row = stmt.get(key);
  return row ? row.value : defaultValue;
}

export function setSetting(key, value) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updatedAt)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updatedAt = CURRENT_TIMESTAMP
  `);
  stmt.run(key, String(value));
}

export function getFailureThreshold() {
  const envValue = process.env.FAILURE_THRESHOLD;
  if (envValue && /^(0|[1-9]\d*)$/.test(envValue)) {
    return Math.max(1, parseInt(envValue, 10));
  }
  const dbValue = getSetting(FAILURE_THRESHOLD_KEY);
  if (dbValue && /^(0|[1-9]\d*)$/.test(dbValue)) {
    return Math.max(1, parseInt(dbValue, 10));
  }
  return DEFAULT_FAILURE_THRESHOLD;
}

export function setFailureThreshold(value) {
  const num = parseInt(value, 10);
  if (!Number.isFinite(num) || num < 1) {
    throw new Error('Threshold must be a positive integer');
  }
  setSetting(FAILURE_THRESHOLD_KEY, String(num));
  return num;
}
