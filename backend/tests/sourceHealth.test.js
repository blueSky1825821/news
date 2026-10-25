import { getDb, closeDb, initSchema } from '../src/db.js';
import { insertSource, getAllSources } from '../src/models/source.js';
import {
  recordSuccess,
  recordFailure,
  getHealth,
  deactivateSource,
  reactivateSource,
  listHealth
} from '../src/models/sourceHealth.js';

describe('Source Health', () => {
  let sourceId;

  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    const db = getDb();
    initSchema(db);
    sourceId = insertSource({
      name: 'Test Source',
      rssUrl: 'http://example.com/rss.xml',
      category: 'test',
      isActive: 1,
      fetchIntervalMinutes: 10
    });
  });

  afterEach(() => {
    closeDb();
    delete process.env.DB_PATH;
  });

  test('recordSuccess initializes health with zero failures', () => {
    recordSuccess(sourceId);
    const health = getHealth(sourceId);
    expect(health.consecutiveFailures).toBe(0);
    expect(health.lastError).toBeNull();
  });

  test('recordFailure increments consecutive failures', () => {
    recordFailure(sourceId, 'Network error');
    recordFailure(sourceId, 'Timeout');
    const health = getHealth(sourceId);
    expect(health.consecutiveFailures).toBe(2);
    expect(health.lastError).toContain('Timeout');
  });

  test('recordSuccess resets failures after failures', () => {
    recordFailure(sourceId, 'error');
    recordFailure(sourceId, 'error');
    recordSuccess(sourceId);
    const health = getHealth(sourceId);
    expect(health.consecutiveFailures).toBe(0);
  });

  test('deactivateSource disables source after threshold', () => {
    const threshold = 3;
    for (let i = 0; i < threshold - 1; i++) {
      recordFailure(sourceId, 'error');
      expect(deactivateSource(sourceId, threshold)).toBe(false);
    }
    recordFailure(sourceId, 'error');
    expect(deactivateSource(sourceId, threshold)).toBe(true);

    const source = getAllSources().find((s) => s.id === sourceId);
    expect(source.isActive).toBe(0);
  });

  test('reactivateSource enables source and resets health', () => {
    recordFailure(sourceId, 'error');
    recordFailure(sourceId, 'error');
    deactivateSource(sourceId, 2);

    expect(reactivateSource(sourceId)).toBe(true);
    const source = getAllSources().find((s) => s.id === sourceId);
    expect(source.isActive).toBe(1);
    expect(getHealth(sourceId).consecutiveFailures).toBe(0);
  });

  test('listHealth returns joined data', () => {
    recordFailure(sourceId, 'bad');
    const health = listHealth();
    expect(health).toHaveLength(1);
    expect(health[0].consecutiveFailures).toBe(1);
    expect(health[0].name).toBe('Test Source');
  });
});
