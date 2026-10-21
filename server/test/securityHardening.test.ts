import { describe, it, expect, afterEach } from 'vitest';
import { isValidBackupName, restoreBackup, previewBackup, deleteBackup, generateTabContent } from '../src/services/dataService';
import { hasValidKey } from '../src/middleware/auth.middleware';
import { playersToTabContent } from '../../shared/utils/tabUtils';
import { NUM_ROUNDS } from '../../shared/utils/constants';
import type { PlayerData } from '../../shared/types/index';

function makePlayer(overrides: Partial<PlayerData> = {}): PlayerData {
  return {
    rank: 1,
    group: 'A',
    lastName: 'Smith',
    firstName: 'John',
    rating: 1500,
    nRating: 1500,
    trophyEligible: true,
    grade: '5',
    num_games: 0,
    attendance: 0,
    phone: '',
    info: '',
    school: '',
    room: '',
    gameResults: new Array(NUM_ROUNDS).fill(null),
    ...overrides,
  };
}

describe('H1: backup filename validation', () => {
  it('accepts generated backup names', () => {
    expect(isValidBackupName('ladder_backup_20260101_120000.tab')).toBe(true);
    expect(isValidBackupName('queen_game_backup_20260101_120000.tab')).toBe(true);
  });

  it('rejects path traversal and malformed names', () => {
    const bad = [
      '../../etc/passwd.tab',
      '../../other-instance/data/ladder_backup_20260101_120000.tab',
      '..%2F..%2Fladder_backup_20260101_120000.tab',
      'ladder_backup_20260101_120000.tab.evil',
      'evil.tab',
      'ladder_backup_20.tab',
      'LADDER_backup_20260101_120000.tab',
      'ladder backup_20260101_120000.tab',
      '/absolute/ladder_backup_20260101_120000.tab',
      '',
    ];
    for (const name of bad) {
      expect(isValidBackupName(name)).toBe(false);
    }
  });

  it('service functions refuse traversal names without touching disk', async () => {
    const traversal = '../../outside_backup_20260101_120000.tab';
    await expect(restoreBackup(traversal)).resolves.toBe(false);
    await expect(previewBackup(traversal)).resolves.toBeNull();
    await expect(deleteBackup(traversal)).resolves.toBe(false);
  });
});

describe('H2/M1/L2: TSV writer sanitization', () => {
  it('generateTabContent strips newlines and tabs from fields', () => {
    const evil = makePlayer({
      lastName: 'Evil\nGroup\tForged',
      info: 'a\r\nb',
      gameResults: ['1W1\nFORGERY', ...new Array(NUM_ROUNDS - 1).fill(null)],
    });
    const content = generateTabContent({ header: [], players: [evil], rawLines: [] });
    const lines = content.replace(/\n$/, '').split('\n');

    expect(lines.length).toBe(2); // header + 1 player — no forged row
    const expectedCols = 13 + NUM_ROUNDS;
    expect(lines[1].split('\t').length).toBe(expectedCols);
    expect(content).not.toContain('FORGERY\n');
  });

  it('playersToTabContent strips structural characters too', () => {
    const content = playersToTabContent([makePlayer({ firstName: 'A\tB\r\nC' })]);
    const lines = content.replace(/\n$/, '').split('\n');
    expect(lines.length).toBe(2);
    expect(lines[1].split('\t').length).toBe(13 + NUM_ROUNDS);
  });
});

describe('hasValidKey', () => {
  const saved = { admin: process.env.ADMIN_API_KEY, user: process.env.USER_API_KEY };

  afterEach(() => {
    if (saved.admin === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = saved.admin;
    if (saved.user === undefined) delete process.env.USER_API_KEY;
    else process.env.USER_API_KEY = saved.user;
  });

  const req = (key?: string) => ({ headers: key ? { 'x-api-key': key } : {} } as never);

  it('treats requests as valid when no keys are configured (dev)', () => {
    delete process.env.ADMIN_API_KEY;
    delete process.env.USER_API_KEY;
    expect(hasValidKey(req())).toBe(true);
  });

  it('requires a key when one is configured', () => {
    process.env.ADMIN_API_KEY = 'admin-secret';
    expect(hasValidKey(req())).toBe(false);
    expect(hasValidKey(req('wrong'))).toBe(false);
    expect(hasValidKey(req('admin-secret'))).toBe(true);
  });

  it('accepts either admin or user key', () => {
    process.env.ADMIN_API_KEY = 'admin-secret';
    process.env.USER_API_KEY = 'user-secret';
    expect(hasValidKey(req('user-secret'))).toBe(true);
    expect(hasValidKey(req('admin-secret'))).toBe(true);
    expect(hasValidKey(req('nope'))).toBe(false);
  });
});
