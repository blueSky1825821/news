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

    const result = db.prepare(`
      INSERT INTO articles (title, originalUrl, sourceId, fetchedAt)
      VALUES (?, ?, ?, datetime('now', '-100 days'))
    `).run('Old Flagged Article', 'http://example.com/flagged', source.id);
    flagArticle(result.lastInsertRowid);

    const beforeDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const deleted = cleanupOldArticles(beforeDate);
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

    const beforeDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const deleted = cleanupOldArticles(beforeDate);
    expect(deleted).toBe(0);
  });
});

describe('Cleanup Scheduler', () => {
  let cronMock;

  beforeEach(async () => {
    jest.resetModules();
    cronMock = { schedule: jest.fn(() => ({ stop: jest.fn() })) };
    jest.unstable_mockModule('node-cron', () => ({ default: cronMock }));
  });

  afterEach(() => {
    delete process.env.CLEANUP_ENABLED;
    delete process.env.CLEANUP_RETENTION_DAYS;
  });

  it('does not register cron when CLEANUP_ENABLED=false', async () => {
    process.env.CLEANUP_ENABLED = 'false';
    const { startCleanupScheduler } = await import('../src/services/scheduler.js');
    startCleanupScheduler();
    expect(cronMock.schedule).not.toHaveBeenCalled();
  });

  it('registers cron with default retention when env is invalid', async () => {
    process.env.CLEANUP_RETENTION_DAYS = 'abc';
    const { startCleanupScheduler } = await import('../src/services/scheduler.js');
    startCleanupScheduler();
    expect(cronMock.schedule).toHaveBeenCalledTimes(1);
    expect(cronMock.schedule.mock.calls[0][0]).toBe('0 0 * * *');
  });

  it('stops cleanup scheduler', async () => {
    const { startCleanupScheduler, stopCleanupScheduler } = await import('../src/services/scheduler.js');
    startCleanupScheduler();
    stopCleanupScheduler();
    // 如果 stop 不抛异常就算通过
    expect(true).toBe(true);
  });
});