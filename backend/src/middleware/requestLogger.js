import { randomUUID } from 'node:crypto';
import { createLogger, elapsedMs } from '../utils/logger.js';

const logger = createLogger('http');

export function requestLogger(req, res, next) {
  const startedAt = performance.now();
  req.requestId = randomUUID();
  res.setHeader('X-Request-ID', req.requestId);

  res.once('close', () => {
    const aborted = !res.writableFinished;
    const durationMs = elapsedMs(startedAt);
    const level = aborted || res.statusCode >= 500 || durationMs >= 1_000 ? 'warn' : 'info';
    logger[level](aborted ? 'request.aborted' : 'request.completed', {
      requestId: req.requestId,
      method: req.method,
      basePath: req.baseUrl || undefined,
      route: req.route?.path,
      status: aborted ? undefined : res.statusCode,
      durationMs
    });
  });

  next();
}
