import { createLogger, errorDetails } from '../utils/logger.js';

const logger = createLogger('http');

export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || statusCode;
  const message = err.message || 'Internal Server Error';
  const level = statusCode >= 500 ? 'error' : 'debug';
  logger[level]('request.error', {
    requestId: req.requestId,
    status: statusCode,
    code,
    ...(statusCode >= 500 ? errorDetails(err) : {})
  });
  if (res.headersSent) return next(err);
  res.status(statusCode).json({ code, message, data: null });
}
