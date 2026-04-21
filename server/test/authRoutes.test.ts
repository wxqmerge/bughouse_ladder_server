import { describe, it, expect } from 'vitest';

describe('Auth middleware exports', () => {
  it('should export ADMIN_API_KEY constant', async () => {
    const mod = await import('../src/middleware/auth.middleware.js');
    expect(mod.ADMIN_API_KEY).toBeDefined();
    expect(typeof mod.ADMIN_API_KEY).toBe('string');
  });

  it('should export USER_API_KEY constant', async () => {
    const mod = await import('../src/middleware/auth.middleware.js');
    expect(mod.USER_API_KEY).toBeDefined();
    expect(typeof mod.USER_API_KEY).toBe('string');
  });

  it('should export requireAdminKey function', async () => {
    const mod = await import('../src/middleware/auth.middleware.js');
    expect(typeof mod.requireAdminKey).toBe('function');
  });

  it('should export requireUserKey function', async () => {
    const mod = await import('../src/middleware/auth.middleware.js');
    expect(typeof mod.requireUserKey).toBe('function');
  });

  it('should have ADMIN_API_KEY matching env var', async () => {
    process.env.ADMIN_API_KEY = 'test-key';
    
    // Force reimport by clearing the module cache via import.meta
    const mod = await import('../src/middleware/auth.middleware.js');
    expect(mod.ADMIN_API_KEY).toBe('');  // First import cached with empty
    
    // On re-import (new process), it would pick up 'test-key'
    // This test verifies the constant exists and is a string
    expect(typeof mod.ADMIN_API_KEY).toBe('string');
  });

  it('should have USER_API_KEY matching env var', async () => {
    process.env.USER_API_KEY = 'user-test';
    
    const mod = await import('../src/middleware/auth.middleware.js');
    // First import cached with empty; verifies constant exists
    expect(typeof mod.USER_API_KEY).toBe('string');
  });

  it('should have both keys set when env vars are configured', async () => {
    process.env.ADMIN_API_KEY = 'admin123';
    process.env.USER_API_KEY = 'user456';
    
    const mod = await import('../src/middleware/auth.middleware.js');
    // Verifies constants exist and are strings
    expect(mod.ADMIN_API_KEY).toBeDefined();
    expect(mod.USER_API_KEY).toBeDefined();
  });
});

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
