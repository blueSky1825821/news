import { Router } from 'express';
import { triggerManualCrawl, triggerManualCrawlForSource } from '../services/scheduler.js';

const router = Router();

router.post('/trigger', async (req, res, next) => {
  try {
    const results = await triggerManualCrawl();
    const total = results.reduce((sum, r) => sum + (r.count || 0), 0);
    const failed = results.filter((r) => r.error);
    const message = failed.length > 0
      ? `Crawl finished. Added ${total} articles. ${failed.length} source(s) failed.`
      : `Crawl finished. Added ${total} articles.`;
    res.sendJson(0, message, { results, total, failedCount: failed.length });
  } catch (err) {
    next(err);
  }
});

router.post('/sources/:id', async (req, res, next) => {
  try {
    const sourceId = parseInt(req.params.id);
    const result = await triggerManualCrawlForSource(sourceId);
    res.sendJson(0, 'Crawl finished', result);
  } catch (err) {
    next(err);
  }
});

export default router;
