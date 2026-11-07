import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDelta, getKeyPrefix, _resetDeltaStateForTesting } from '../../services/storageService';

import { DeltaOperation } from '../../../shared/types';

// Mock dataService (storageService flushes through it on a timer)
vi.mock('../../services/dataService', () => ({
  dataService: {
    getMode: vi.fn().mockReturnValue('SERVER'),
    submitDeltaBatch: vi.fn().mockResolvedValue(undefined),
  },
  DataServiceMode: {
    LOCAL: 'LOCAL',
    DEVELOPMENT: 'DEVELOPMENT',
    SERVER: 'SERVER',
  },
}));

// Mock localStorage and other globals
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index],
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });
Object.defineProperty(window, 'location', { value: { hostname: 'localhost', pathname: '/' }, writable: true });

function readPersistedQueue(): DeltaOperation[] {
  const raw = localStorage.getItem(getKeyPrefix() + 'ladder_delta_queue');
  return raw ? (JSON.parse(raw) as DeltaOperation[]) : [];
}

describe('storageService Delta Queue persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    _resetDeltaStateForTesting();
  });

  it('persists a delta to localStorage when one is queued', () => {
    const op: DeltaOperation = { type: 'GAME_RESULT', playerRank: 1, round: 5, result: 'W' };
    addDelta(op);
    expect(readPersistedQueue()).toEqual([op]);
  });

  it('persists deltas in queue order', () => {
    const op1: DeltaOperation = { type: 'GAME_RESULT', playerRank: 1, round: 5, result: 'W' };
    const op2: DeltaOperation = { type: 'CLEAR_CELL', playerRank: 2, round: 3 };
    addDelta(op1);
    addDelta(op2);
    expect(readPersistedQueue()).toEqual([op1, op2]);
  });

  it('drops the oldest entry from persistence when the queue cap is exceeded', () => {
    // Fill past MAX_DELTA_QUEUE_SIZE (500)
    for (let i = 0; i < 505; i++) {
      addDelta({ type: 'GAME_RESULT', playerRank: i + 1, round: 0, result: 'W' });
    }
    const persisted = readPersistedQueue();
    expect(persisted.length).toBe(500);
    // Oldest 5 (ranks 1-5) were dropped
    expect((persisted[0] as Extract<DeltaOperation, { type: 'GAME_RESULT' }>).playerRank).toBe(6);
  });
});
