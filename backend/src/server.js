import { getTriggeredAt, logConsole, withLogTrigger } from './utils/logger.js';
import './config.js';
import { app } from './app.js';
import { getDb, closeDb } from './db.js';
import { seedSources } from './seed.js';
import { startScheduler, startSummaryPushScheduler, startCleanupScheduler, startXinwenlianboScheduler, stopScheduler, stopSummaryPushScheduler, stopCleanupScheduler, stopXinwenlianboScheduler } from './services/scheduler.js';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Global uncaught exception handlers to prevent process crash
process.on('uncaughtException', (err) => {
  logConsole('error', '[FATAL] Uncaught exception:', err);
  // Keep process alive; log only. Restart should be handled by process manager.
});

process.on('unhandledRejection', (reason, promise) => {
  logConsole('error', '[FATAL] Unhandled rejection at:', promise, 'reason:', reason);
  // Keep process alive
});

const server = withLogTrigger(() => {
  getDb();
  seedSources();

  // Recover orphaned xinwenlianbo tasks from previous crash
  const db = getDb();
  const orphaned = db.prepare(`UPDATE xinwenlianbo_tasks SET status = 'failed', errorMessage = 'Service interrupted' WHERE status NOT IN ('pending', 'completed', 'failed', 'cancelled')`).run();
  if (orphaned.changes > 0) {
    logConsole('log', `[Xinwenlianbo] Recovered ${orphaned.changes} orphaned task(s) from previous crash.`);
  }

  startScheduler();
  startSummaryPushScheduler();
  startCleanupScheduler();
  startXinwenlianboScheduler();

  return app.listen(PORT, HOST, () => {
    logConsole('log', `Server running on http://${HOST}:${PORT}`);
  });
});

// Graceful shutdown on SIGTERM/SIGINT
function gracefulShutdown(signal) {
  withLogTrigger(() => {
    const triggeredAt = getTriggeredAt();
    logConsole('log', `[Server] Received ${signal}, shutting down gracefully...`);
    stopScheduler();
    stopSummaryPushScheduler();
    stopCleanupScheduler();
    stopXinwenlianboScheduler();
    server.close(() => withLogTrigger(() => {
      closeDb();
      logConsole('log', '[Server] Closed. Exiting.');
      process.exit(0);
    }, triggeredAt));
    // Force exit after 10s
    setTimeout(() => {
      logConsole('error', '[Server] Force exit after timeout');
      process.exit(1);
    }, 10000);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Ignore SIGHUP so SSH disconnect doesn't kill the process
process.on('SIGHUP', () => {
  logConsole('log', '[Server] Received SIGHUP, ignoring (use SIGTERM to stop)');
});

