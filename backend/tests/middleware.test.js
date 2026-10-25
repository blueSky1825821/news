import { jest } from '@jest/globals';
import { responseWrapper } from '../src/middleware/responseWrapper.js';
import { errorHandler } from '../src/middleware/errorHandler.js';

describe('responseWrapper', () => {
  it('should add sendJson to res', () => {
    const req = {};
    const res = { json: jest.fn() };
    const next = jest.fn();
    responseWrapper(req, res, next);
    expect(next).toHaveBeenCalled();
    res.sendJson(0, 'ok', { foo: 'bar' });
    expect(res.json).toHaveBeenCalledWith({ code: 0, message: 'ok', data: { foo: 'bar' } });
  });
});

describe('errorHandler', () => {
  it('should handle errors with default status 500', () => {
    const err = new Error('Something broke');
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ code: 500, message: 'Something broke', data: null });
  });

  it('should use err.statusCode if provided', () => {
    const err = new Error('Not found');
    err.statusCode = 404;
    err.code = 1001;
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ code: 1001, message: 'Not found', data: null });
  });
});
