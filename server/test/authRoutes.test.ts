import { describe, it, expect } from 'vitest';

describe('Auth middleware function types', () => {
  it('requireAdminKey accepts (req, res, next) - Express middleware signature', async () => {
    const mod = await import('../src/middleware/auth.middleware.js');
    expect(mod.requireAdminKey.length).toBe(3); // req, res, next
  });

  it('requireUserKey accepts (req, res, next) - Express middleware signature', async () => {
    const mod = await import('../src/middleware/auth.middleware.js');
    expect(mod.requireUserKey.length).toBe(3); // req, res, next
  });
});
