import { AsyncLocalStorage } from 'node:async_hooks';

const levels = { debug: 10, info: 20, warn: 30, error: 40, silent: Infinity };
const logContext = new AsyncLocalStorage();

export function getTriggeredAt() {
  return logContext.getStore() ?? new Date().toISOString();
}

export function withLogTrigger(callback, triggeredAt = new Date().toISOString()) {
  return logContext.run(triggeredAt, callback);
}

export function logConsole(level, ...args) {
  console[level](`[triggeredAt=${getTriggeredAt()}]`, ...args);
}

export function createLogger(component) {
  function write(level, event, fields) {
    const configured = process.env.LOG_LEVEL?.toLowerCase();
    const minimum = Object.hasOwn(levels, configured) ? levels[configured] : levels.info;
    if (levels[level] < minimum) return;

    const time = new Date().toISOString();
    const triggeredAt = fields?.triggeredAt ?? logContext.getStore() ?? time;
    const entry = JSON.stringify({ time, level, component, event, ...fields, triggeredAt });
    console[level === 'debug' ? 'log' : level](entry);
  }

  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields)
  };
}

export function errorDetails(error) {
  return {
    errorName: error?.name,
    errorCode: error?.code ?? error?.cause?.code,
    stackFrames: typeof error?.stack === 'string'
      ? error.stack.split('\n').filter(line => /^\s+at /.test(line)).slice(0, 8)
      : undefined
  };
}

export function elapsedMs(startedAt) {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}
