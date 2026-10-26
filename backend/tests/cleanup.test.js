import { jest } from '@jest/globals';
import { getDb, closeDb, initSchema } from '../src/db.js';
import { insertSource, getAllSources } from '../src/models/source.js';
import { cleanupOldArticles } from '../src/models/article.js';
import { flagArticle } from '../src/models/articleFlag.js';

describe('Cleanup Model', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
    insertSource({ name: 'Test', rssUrl: 'http://test.com/rss', category: 'tech', isActive: 1 });
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  it('deletes only old unflagged articles', () => {
    const db = getDb();
    const source = getAllSources()[0];

    db.prepare(`
      INSERT INTO articles (title, originalUrl, sourceId, fetchedAt)
      VALUES (?, ?, ?, datetime('now', '-100 days'))
    `).run('Old Article', 'http://example.com/old', source.id);

    db.prepare(`
      INSERT INTO articles (title, originalUrl, sourceId, fetchedAt)
      VALUES (?, ?, ?, datetime('now', '-1 days'))
    `).run('Recent Article', 'http://example.com/recent', source.id);

    db.prepare(`
      INSERT INTO articles (title, originalUrl, sourceId, fetchedAt)
      VALUES (?, ?, ?, datetime('now', '-100 days'))
    `).run('Old Flagged Article', 'http://example.com/flagged', source.id);
    const flaggedId = db.prepare('SELECT last_insert_rowid() as id').get().id;
    flagArticle(flaggedId);

    const deleted = cleanupOldArticles(90);
    expect(deleted).toBe(1);

    const remaining = db.prepare('SELECT title FROM articles ORDER BY title').all();
    expect(remaining.map(r => r.title)).toEqual(['Old Flagged Article', 'Recent Article']);
  });

  it('returns 0 when no articles match', () => {
    const db = getDb();
    const source = getAllSources()[0];

    db.prepare(`
      INSERT INTO articles (title, originalUrl, sourceId, fetchedAt)
      VALUES (?, ?, ?, datetime('now', '-1 days'))
    `).run('Recent Article', 'http://example.com/recent', source.id);

    const deleted = cleanupOldArticles(90);
    expect(deleted).toBe(0);
  });
});
