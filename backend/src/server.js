import { app } from './app.js';
import { getDb } from './db.js';
import { seedSources } from './seed.js';
import { startScheduler, startSummaryPushScheduler, startCleanupScheduler } from './services/scheduler.js';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

getDb();
seedSources();
startScheduler();
startSummaryPushScheduler();
startCleanupScheduler();

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

