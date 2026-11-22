import { EventEmitter } from 'node:events';
import { jest } from '@jest/globals';
import { requestLogger } from '../src/middleware/requestLogger.js';
import { createLogger, withLogTrigger } from '../src/utils/logger.js';

test('concurrent requests keep their own trigger time through asynchronous work and response close', async () => {
  const consoleInfo = jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.useFakeTimers({ doNotFake: ['performance'] });

  try {
    const logger = createLogger('test');
    const startRequest = (triggeredAt) => {
      jest.setSystemTime(new Date(triggeredAt));
      const req = { method: 'GET' };
      const res = new EventEmitter();
      res.setHeader = jest.fn();
      res.writableFinished = true;
      res.statusCode = 200;

      let finish;
      const pending = new Promise(resolve => { finish = resolve; });
      withLogTrigger(() => requestLogger(req, res, async () => {
        logger.info('work.started', { requestId: req.requestId });
        await pending;
        logger.info('work.completed', { requestId: req.requestId });
      }), '2026-01-01T00:00:00.000Z');

      return { finish, req, res, triggeredAt };
    };

    const first = startRequest('2026-01-02T00:00:00.000Z');
    const second = startRequest('2026-01-02T00:00:01.000Z');
    jest.setSystemTime(new Date('2026-01-02T00:00:02.000Z'));

    for (const { finish, res } of [second, first]) {
      finish();
      await Promise.resolve();
      res.emit('close');
    }

    const entries = consoleInfo.mock.calls.map(([line]) => JSON.parse(line));
    for (const { req, triggeredAt } of [first, second]) {
      const logs = entries.filter(entry => entry.requestId === req.requestId);
      expect(logs.map(entry => entry.event)).toEqual(['work.started', 'work.completed', 'request.completed']);
      expect(logs.map(entry => entry.triggeredAt)).toEqual([triggeredAt, triggeredAt, triggeredAt]);
      expect(logs.at(-1).time).toBe('2026-01-02T00:00:02.000Z');
    }
  } finally {
    jest.useRealTimers();
    consoleInfo.mockRestore();
  }
});
