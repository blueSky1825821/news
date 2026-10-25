import { getDb } from '../db.js';
import { getFailureThreshold } from './settings.js';

export function getHealth(sourceId) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM source_health WHERE sourceId = ?');
  return stmt.get(sourceId) || { sourceId, consecutiveFailures: 0, lastError: null, lastErrorAt: null };
}

export function recordSuccess(sourceId) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO source_health (sourceId, consecutiveFailures, lastError, lastErrorAt)
    VALUES (?, 0, NULL, NULL)
    ON CONFLICT(sourceId) DO UPDATE SET
      consecutiveFailures = 0,
      lastError = NULL,
      lastErrorAt = NULL
  `);
  stmt.run(sourceId);
}

export function recordFailure(sourceId, errorMessage) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO source_health (sourceId, consecutiveFailures, lastError, lastErrorAt)
    VALUES (?, 1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(sourceId) DO UPDATE SET
      consecutiveFailures = consecutiveFailures + 1,
      lastError = excluded.lastError,
      lastErrorAt = CURRENT_TIMESTAMP
  `);
  stmt.run(sourceId, errorMessage?.slice(0, 500) || null);
}

export function deactivateSource(sourceId, threshold = getFailureThreshold()) {
  const db = getDb();
  const health = getHealth(sourceId);
  if (health.consecutiveFailures < threshold) return false;

  const deactivateStmt = db.prepare(`
    UPDATE sources SET isActive = 0 WHERE id = ? AND isActive = 1
  `);
  const result = deactivateStmt.run(sourceId);
  return result.changes > 0;
}

export function reactivateSource(sourceId) {
  const db = getDb();
  const activateStmt = db.prepare(`
    UPDATE sources SET isActive = 1 WHERE id = ? AND isActive = 0
  `);
  const result = activateStmt.run(sourceId);

  if (result.changes > 0) {
    recordSuccess(sourceId);
    return true;
  }
  return false;
}

export function listHealth() {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT s.id, s.name, s.rssUrl, s.isActive, s.category,
           COALESCE(h.consecutiveFailures, 0) AS consecutiveFailures,
           h.lastError, h.lastErrorAt
    FROM sources s
    LEFT JOIN source_health h ON s.id = h.sourceId
    ORDER BY s.id
  `);
  return stmt.all();
}
