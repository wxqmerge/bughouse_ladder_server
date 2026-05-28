import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requireAdminKey, requireUserKey } from '../src/middleware/auth.middleware.js';

// Minimal Express mock types
function createMockReq(overrides: Record<string, any> = {}): any {
  return {
    method: 'POST',
    path: '/admin/test',
    ip: '127.0.0.1',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  };
}

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

function createMockNext() {
  let called = false;
  const next = () => { called = true; };
  next.called = () => called;
  return next;
}

describe('requireAdminKey', () => {
  beforeEach(() => {
    delete process.env.ADMIN_API_KEY;
    delete process.env.USER_API_KEY;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
    delete process.env.USER_API_KEY;
    delete process.env.NODE_ENV;
  });

  it('should return 403 when ADMIN_API_KEY is not configured (no key)', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.error.message).toBe('Admin API key not configured on server');
    expect(next.called()).toBe(false);
  });

  it('should return 403 when ADMIN_API_KEY is empty string', () => {
    process.env.ADMIN_API_KEY = '';
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.jsonBody.success).toBe(false);
    expect(next.called()).toBe(false);
  });

  it('should return 401 when ADMIN_API_KEY is set but no key sent', () => {
    process.env.ADMIN_API_KEY = 'secret-key-123';
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.error.message).toBe('Admin API key required');
    expect(next.called()).toBe(false);
  });

  it('should return 401 when ADMIN_API_KEY is set but wrong key sent', () => {
    process.env.ADMIN_API_KEY = 'secret-key-123';
    const req = createMockReq({ headers: { 'x-api-key': 'wrong-key' } });
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody.success).toBe(false);
    expect(res.jsonBody.error.message).toBe('Invalid admin API key');
    expect(next.called()).toBe(false);
  });

  it('should call next when correct key is provided', () => {
    process.env.ADMIN_API_KEY = 'secret-key-123';
    const req = createMockReq({ headers: { 'x-api-key': 'secret-key-123' } });
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(next.called()).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toBe(null);
  });

  it('should reject key with different length', () => {
    process.env.ADMIN_API_KEY = 'longer-key-value';
    const req = createMockReq({ headers: { 'x-api-key': 'short' } });
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next.called()).toBe(false);
  });

  it('should work in production mode with key configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_API_KEY = 'prod-secret';
    const req = createMockReq({ headers: { 'x-api-key': 'prod-secret' } });
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(next.called()).toBe(true);
  });

  it('should return 403 in production when ADMIN_API_KEY not configured', () => {
    process.env.NODE_ENV = 'production';
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next.called()).toBe(false);
  });

  it('should return 403 in dev mode when ADMIN_API_KEY not configured', () => {
    process.env.NODE_ENV = 'development';
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next.called()).toBe(false);
  });

  it('should delegate to requireUserKey for GET /tournament/ endpoints', () => {
    process.env.USER_API_KEY = 'user-key';
    const req = createMockReq({
      method: 'GET',
      path: '/tournament/data',
      headers: { 'x-api-key': 'user-key' },
    });
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(next.called()).toBe(true);
  });

  it('should not delegate non-GET requests to requireUserKey', () => {
    process.env.ADMIN_API_KEY = 'admin-key';
    const req = createMockReq({
      method: 'POST',
      path: '/tournament/data',
      headers: { 'x-api-key': 'admin-key' },
    });
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(next.called()).toBe(true);
  });
});

describe('requireUserKey', () => {
  beforeEach(() => {
    delete process.env.ADMIN_API_KEY;
    delete process.env.USER_API_KEY;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
    delete process.env.USER_API_KEY;
    delete process.env.NODE_ENV;
  });

  it('should return 403 when neither key is configured (view-only mode)', () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    requireUserKey(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.jsonBody.success).toBe(false);
    expect(next.called()).toBe(false);
  });

  it('should allow request when ADMIN_API_KEY is set but USER_API_KEY is not (admin can write)', () => {
    process.env.ADMIN_API_KEY = 'admin-secret';
    const req = createMockReq({ headers: { 'x-api-key': 'admin-secret' } });
    const res = createMockRes();
    const next = createMockNext();

    requireUserKey(req, res, next);

    expect(next.called()).toBe(true);
  });

  it('should reject when only ADMIN_API_KEY is set but no key sent', () => {
    process.env.ADMIN_API_KEY = 'admin-secret';
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    requireUserKey(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next.called()).toBe(false);
  });

  it('should reject when only ADMIN_API_KEY is set but wrong key sent', () => {
    process.env.ADMIN_API_KEY = 'admin-secret';
    const req = createMockReq({ headers: { 'x-api-key': 'wrong-key' } });
    const res = createMockRes();
    const next = createMockNext();

    requireUserKey(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next.called()).toBe(false);
  });

  it('should return 401 when USER_API_KEY is set but no key sent', () => {
    process.env.USER_API_KEY = 'user-secret';
    const req = createMockReq();
    const res = createMockRes();
    const next = createMockNext();

    requireUserKey(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody.success).toBe(false);
    expect(next.called()).toBe(false);
  });

  it('should return 401 when USER_API_KEY is set but wrong key sent', () => {
    process.env.USER_API_KEY = 'user-secret';
    const req = createMockReq({ headers: { 'x-api-key': 'wrong' } });
    const res = createMockRes();
    const next = createMockNext();

    requireUserKey(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next.called()).toBe(false);
  });

  it('should allow request when correct USER_API_KEY is sent', () => {
    process.env.USER_API_KEY = 'user-secret';
    const req = createMockReq({ headers: { 'x-api-key': 'user-secret' } });
    const res = createMockRes();
    const next = createMockNext();

    requireUserKey(req, res, next);

    expect(next.called()).toBe(true);
  });

  it('should allow admin key even on user-endpoint', () => {
    process.env.ADMIN_API_KEY = 'admin-secret';
    process.env.USER_API_KEY = 'user-secret';
    const req = createMockReq({ headers: { 'x-api-key': 'admin-secret' } });
    const res = createMockRes();
    const next = createMockNext();

    requireUserKey(req, res, next);

    expect(next.called()).toBe(true);
  });

  it('should reject user key on admin-endpoint (requireAdminKey)', () => {
    process.env.ADMIN_API_KEY = 'admin-secret';
    process.env.USER_API_KEY = 'user-secret';
    const req = createMockReq({ headers: { 'x-api-key': 'user-secret' } });
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(next.called()).toBe(false);
  });
});

describe('Write endpoints without API key (regression)', () => {
  beforeEach(() => {
    delete process.env.ADMIN_API_KEY;
    delete process.env.USER_API_KEY;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
    delete process.env.USER_API_KEY;
    delete process.env.NODE_ENV;
  });

  it('should block game/submit when no API keys configured', () => {
    const req = createMockReq({
      method: 'POST',
      path: '/submit',
      body: { playerRank: 1, round: 0, result: '6W8' },
    });
    const res = createMockRes();
    const next = createMockNext();

    requireUserKey(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next.called()).toBe(false);
  });

  it('should block ladder PUT when no API keys configured', () => {
    const req = createMockReq({
      method: 'PUT',
      path: '/',
      body: { players: [] },
    });
    const res = createMockRes();
    const next = createMockNext();

    requireUserKey(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next.called()).toBe(false);
  });

  it('should block ladder/batch when no API keys configured', () => {
    const req = createMockReq({
      method: 'POST',
      path: '/batch',
      body: { deltas: [] },
    });
    const res = createMockRes();
    const next = createMockNext();

    requireUserKey(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next.called()).toBe(false);
  });
});

describe('Admin lock flow without API key (regression)', () => {
  beforeEach(() => {
    delete process.env.ADMIN_API_KEY;
    delete process.env.USER_API_KEY;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
    delete process.env.USER_API_KEY;
    delete process.env.NODE_ENV;
  });

  it('should block admin lock acquire when no ADMIN_API_KEY configured', () => {
    const req = createMockReq({
      method: 'POST',
      path: '/acquire',
      body: { clientId: 'client_1', clientName: 'Test Client' },
    });
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next.called()).toBe(false);
  });

  it('should block admin lock status check when no ADMIN_API_KEY configured', () => {
    const req = createMockReq({
      method: 'GET',
      path: '/status',
    });
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next.called()).toBe(false);
  });

  it('should block admin lock force acquire when no ADMIN_API_KEY configured', () => {
    const req = createMockReq({
      method: 'POST',
      path: '/force',
      body: { clientId: 'client_1', clientName: 'Test Client' },
    });
    const res = createMockRes();
    const next = createMockNext();

    requireAdminKey(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next.called()).toBe(false);
  });
});
