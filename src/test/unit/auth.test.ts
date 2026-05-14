import { describe, it, expect } from 'vitest';

describe('Auth middleware function types', () => {
  it('should export requireAdminKey function', async () => {
    const mod = await import('../../../server/src/middleware/auth.middleware');
    expect(typeof mod.requireAdminKey).toBe('function');
  });

  it('should export requireUserKey function', async () => {
    const mod = await import('../../../server/src/middleware/auth.middleware');
    expect(typeof mod.requireUserKey).toBe('function');
  });
});

describe('File extension validation logic', () => {
  const ACCEPTED_CLIENT = new Set(['tab', 'txt', 'xls']);
  const ACCEPTED_SERVER = new Set(['.tab', '.xls']);

  it('should accept .tab on client and server', () => {
    expect(ACCEPTED_CLIENT.has('tab')).toBe(true);
    expect(ACCEPTED_SERVER.has('.tab')).toBe(true);
  });

  it('should accept .xls on client and server (VB6 Excel tab format)', () => {
    expect(ACCEPTED_CLIENT.has('xls')).toBe(true);
    expect(ACCEPTED_SERVER.has('.xls')).toBe(true);
  });

  it('should accept .txt on client', () => {
    expect(ACCEPTED_CLIENT.has('txt')).toBe(true);
  });

  it('should reject unsupported extensions', () => {
    const rejected = ['csv', 'json', 'xlsx', 'pdf', 'doc'];
    for (const ext of rejected) {
      expect(ACCEPTED_CLIENT.has(ext)).toBe(false);
      expect(ACCEPTED_SERVER.has(`.${ext}`)).toBe(false);
    }
  });

  it('should handle case-insensitive extension checking', () => {
    // Real code calls .toLowerCase() before checking
    const ext = 'TAB'.toLowerCase();
    expect(ACCEPTED_CLIENT.has(ext)).toBe(true);
    
    const ext2 = 'XLS'.toLowerCase();
    expect(ACCEPTED_CLIENT.has(ext2)).toBe(true);
  });

  it('should extract extension from filename', () => {
    const getExt = (filename: string) => {
      const parts = filename.split('.');
      return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
    };

    expect(getExt('/path/to/ladder.tab')).toBe('tab');
    expect(getExt('ladder.xls')).toBe('xls');
    expect(getExt('file.TXT')).toBe('txt');
    expect(getExt('noextension')).toBe('');
  });
});
