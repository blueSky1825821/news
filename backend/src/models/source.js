import { getDb } from '../db.js';

export function getAllSources() {
  const db = getDb();
  return db.prepare('SELECT * FROM sources ORDER BY id').all();
}

export function getActiveSources() {
  const db = getDb();
  return db.prepare('SELECT * FROM sources WHERE isActive = 1 ORDER BY id').all();
}

export function getSourceById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM sources WHERE id = ?').get(id) || null;
}

export function insertSource({ name, rssUrl, category, isActive = 1, fetchIntervalMinutes = 30 }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO sources (name, rssUrl, category, isActive, fetchIntervalMinutes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(rssUrl) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      isActive = excluded.isActive,
      fetchIntervalMinutes = excluded.fetchIntervalMinutes
  `);
  const result = stmt.run(name, rssUrl, category, isActive, fetchIntervalMinutes);
  return result.lastInsertRowid;
}

export function deleteSource(id) {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM sources WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}
