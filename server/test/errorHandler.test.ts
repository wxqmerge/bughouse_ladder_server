import { describe, it, expect, beforeEach } from 'vitest';
import { AppError, errorHandler } from '../src/middleware/errorHandler.js';

function createMockRes() {
  const res: any = {
    status: function (code: number) {
      res.statusCode = code;
      return res;
    },
    json: function (body: any) {
      res.jsonBody = body;
      return res;
    },
    statusCode: 200,
    jsonBody: null,
  };
  return res;
}

describe('AppError', () => {
  it('should set statusCode and message', () => {
    const err = new AppError('Not found', 404);
    expect(err.message).toBe('Not found');
    expect(err.statusCode).toBe(404);
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });

  it('should set isOperational to true', () => {
    const err = new AppError('Bad request', 400);
    expect(err.isOperational).toBe(true);
  });

  it('should capture stack trace', () => {
    const err = new AppError('Test error', 500);
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('Test error');
  });

  it('should support various status codes', () => {
    const codes = [400, 401, 403, 404, 409, 422, 500, 503];
    for (const code of codes) {
      const err = new AppError(`Error ${code}`, code);
      expect(err.statusCode).toBe(code);
    }
  });
});

describe('errorHandler', () => {
  beforeEach(() => {
    delete process.env.EXPOSE_STACK_TRACES;
  });

  it('should handle AppError with correct status and message', () => {
    const res = createMockRes();
    const err = new AppError('Resource not found', 404);

    errorHandler(err, {} as any, res, () => {});

    expect(res.statusCode).toBe(404);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.error.message).toBe('Resource not found');
    expect(res.jsonBody.error.stack).toBeUndefined();
  });

  it('should handle generic Error as 500', () => {
    const res = createMockRes();
    const err = new Error('Unexpected error');

    errorHandler(err, {} as any, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.error.message).toBe('Internal Server Error');
  });

  it('should handle non-Error thrown values as 500', () => {
    const res = createMockRes();

    errorHandler('string error', {} as any, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.error.message).toBe('Internal Server Error');
  });

  it('should handle null as 500', () => {
    const res = createMockRes();

    errorHandler(null, {} as any, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.success).toBe(false);
  });

  it('should include stack trace when EXPOSE_STACK_TRACES is true', () => {
    process.env.EXPOSE_STACK_TRACES = 'true';
    const res = createMockRes();
    const err = new Error('Debug error');

    errorHandler(err, {} as any, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.error.stack).toBeDefined();
    expect(res.jsonBody.error.stack).toContain('Debug error');
  });

  it('should include stack for AppError when EXPOSE_STACK_TRACES is true', () => {
    process.env.EXPOSE_STACK_TRACES = 'true';
    const res = createMockRes();
    const err = new AppError('Operational error', 400);

    errorHandler(err, {} as any, res, () => {});

    expect(res.statusCode).toBe(400);
    expect(res.jsonBody.error.stack).toBeDefined();
  });

  it('should handle AppError with 500 status', () => {
    const res = createMockRes();
    const err = new AppError('Custom server error', 500);

    errorHandler(err, {} as any, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.jsonBody.error.message).toBe('Custom server error');
  });
});
