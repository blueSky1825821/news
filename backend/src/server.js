import { app } from './app.js';
import { getDb } from './db.js';
import { seedSources } from './seed.js';
import { startScheduler, startSummaryPushScheduler } from './services/scheduler.js';

const PORT = process.env.PORT || 3000;

getDb();
seedSources();
startScheduler();
startSummaryPushScheduler();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

