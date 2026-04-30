import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import LadderForm from '../../components/LadderForm';
import * as storageService from '../../services/storageService';
import * as dataService from '../../services/dataService';
import '@testing-library/jest-dom';

// Mocking dependencies
vi.mock('../../services/storageService', async () => {
  const actual = await vi.importActual('../../services/storageService') as any;
  return {
    ...actual,
    addDelta: vi.fn(),
    savePlayers: vi.fn().mockResolvedValue({ success: true, serverSynced: true }),
    getPlayers: vi.fn().mockResolvedValue([]),
    getJson: vi.fn(),
    setJson: vi.fn(),
    removeJson: vi.fn(),
    markLocalChanges: vi.fn(),
    isServerDownMode: vi.fn().mockReturnValue(false),
    isAdminMode: vi.fn().mockReturnValue(true),
    getPendingNewDay: vi.fn().mockReturnValue(null),
    clearPendingNewDay: vi.fn(),
    clearAllSaveStatus: vi.fn(),
    clearLocalChangesFlag: vi.fn(),
    clearPendingDeletes: vi.fn(),
    getPendingDeletes: vi.fn().mockReturnValue(new Set()),
    queueDelete: vi.fn(),
    startBatch: vi.fn(),
    endBatch: vi.fn(),
    getHasLocalChanges: vi.fn().mockReturnValue(false),
    getKeyPrefix: vi.fn().mockReturnValue('test_'),
  };
});

vi.mock('../../services/dataService', () => ({
  dataService: {
    getMode: vi.fn().mockReturnValue('LOCAL'),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
    notifySubscribers: vi.fn(),
    initializeHash: vi.fn().mockResolvedValue(undefined),
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    getPlayers: vi.fn().mockResolvedValue([]),
    savePlayers: vi.fn().mockResolvedValue(undefined),
    getMode: vi.fn().mockReturnValue('LOCAL'),
    getConfigServerUrl: vi.fn().mockReturnValue('http://localhost:3000'),
  },
  DataServiceMode: {
    LOCAL: 'LOCAL',
    DEVELOPMENT: 'DEVELOPMENT',
    SERVER: 'SERVER',
  },
}));

vi.mock('../../services/userSettingsStorage', () => ({
  loadUserSettings: vi.fn().mockReturnValue({ server: 'http://localhost:3000', apiKey: 'test-key' }),
  normalizeServerUrl: vi.fn((url) => url),
  saveUserSettings: vi.fn(),
  saveLastWorkingConfig: vi.fn(),
}));

vi.mock('../../utils/mode', () => ({
  getProgramMode: vi.fn().mockReturnValue('local'),
  isLocalMode: vi.fn().mockReturnValue(true),
  isServerDownMode: vi.fn().mockReturnValue(false),
  updateConnectionState: vi.fn().mockResolvedValue(undefined),
  startPeriodicChecks: vi.fn(),
  stopPeriodicChecks: vi.fn(),
  onModeChange: vi.fn(),
  getVersionString: vi.fn().mockReturnValue('1.0.0'),
}));

vi.mock('../../utils/log', () => ({
  log: vi.fn(),
}));

vi.mock('../../utils/hashUtils', async () => {
  const actual = await vi.importActual('../../utils/hashUtils') as any;
  return {
    ...actual,
    processGameResults: vi.fn().mockReturnValue({
      matches: [],
      hasErrors: false,
      errorCount: 0,
      errors: [],
      playerResultsByMatch: new Map(),
    }),
  };
});

vi.mock('../../components/MenuBar', () => ({
  default: ({ onAutoLetter }: any) => {
    console.log('[TEST] MenuBar rendering, onAutoLetter:', onAutoLetter);
    (globalThis as any).__capturedOnAutoLetter = onAutoLetter;
    return <div data-testid="mock-menubar">MenuBar</div>;
  },
}));

describe('LadderForm Auto-Letter Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (globalThis as any).__capturedOnAutoLetter = undefined;
    // Ensure isAdminMode returns true for these tests
    (storageService.isAdminMode as any).mockReturnValue(true);
  });

  it('should use nRating if available and non-zero, otherwise use rating', async () => {
    // Player 1: rating 1200, nRating 1300 -> should use 1300 -> 'A'
    // Player 2: rating 800, nRating 0 -> should use 800 -> 'B'
    const mockPlayers = [
      { rank: 1, group: 'A', lastName: 'User1', firstName: 'F1', rating: 1200, nRating: 1300, trophyEligible: true, grade: 'A', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: [] },
      { rank: 2, group: 'B', lastName: 'User2', firstName: 'F2', rating: 800, nRating: 0, trophyEligible: true, grade: 'B', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: [] },
    ];
    (storageService.getPlayers as any).mockResolvedValue(mockPlayers);

    render(<LadderForm />);

    await waitFor(() => {
      expect((globalThis as any).__capturedOnAutoLetter).toBeDefined();
    });

    const onAutoLetter = (globalThis as any).__capturedOnAutoLetter;
    onAutoLetter();

    // Verify results
    await waitFor(() => {
      expect(storageService.savePlayers).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ rank: 1, group: 'A' }), // 1300 -> A
          expect.objectContaining({ rank: 2, group: 'B' }), // 800 -> B
        ]),
        true
      );
    });
  });

  it('should use rating if nRating is zero', async () => {
    // Player 1: rating 1200, nRating 0 -> should use 1200 -> 'A'
    // Player 2: rating 800, nRating 0 -> should use 800 -> 'B'
    const mockPlayers = [
      { rank: 1, group: 'A', lastName: 'User1', firstName: 'F1', rating: 1200, nRating: 0, trophyEligible: true, grade: 'A', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: [] },
      { rank: 2, group: 'B', lastName: 'User2', firstName: 'F2', rating: 800, nRating: 0, trophyEligible: true, grade: 'B', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: [] },
    ];
    (storageService.getPlayers as any).mockResolvedValue(mockPlayers);

    render(<LadderForm />);

    await waitFor(() => {
      expect((globalThis as any).__capturedOnAutoLetter).toBeDefined();
    });

    const onAutoLetter = (globalThis as any).__capturedOnAutoLetter;
    onAutoLetter();

    // Verify results
    await waitFor(() => {
      expect(storageService.savePlayers).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ rank: 1, group: 'A' }),
          expect.objectContaining({ rank: 2, group: 'B' }),
        ]),
        true
      );
    });
  });


    const onAutoLetter = (globalThis as any).__capturedOnAutoLetter;
    onAutoLetter();

    // Verify results
    await waitFor(() => {
      expect(storageService.savePlayers).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ rank: 1, group: 'A' }), // 1300 -> A
          expect.objectContaining({ rank: 2, group: 'B' }), // 800 -> B
        ]),
        true
      );
    });
  });

  it('should use rating if nRating is zero', async () => {
    // Player 1: rating 1200, nRating 0 -> should use 1200 -> 'A'
    // Player 2: rating 800, nRating 0 -> should use 800 -> 'B'
    (storageService.getPlayers as any).mockResolvedValue([
      { rank: 1, group: 'A', lastName: 'User1', firstName: 'F1', rating: 1200, nRating: 0, trophyEligible: true, grade: 'A', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: [] },
      { rank: 2, group: 'B', lastName: 'User2', firstName: 'F2', rating: 800, nRating: 0, trophyEligible: true, grade: 'B', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: [] },
    ]);

    render(<LadderForm />);

    await waitFor(() => {
      expect((globalThis as any).__capturedOnAutoLetter).toBeDefined();
    });

    const onAutoLetter = (globalThis as any).__capturedOnAutoLetter;
    onAutoLetter();

    // Verify results
    await waitFor(() => {
      expect(storageService.savePlayers).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ rank: 1, group: 'A' }),
          expect.objectContaining({ rank: 2, group: 'B' }),
        ]),
        true
      );
    });
  });
});
