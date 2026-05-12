import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, screen } from '@testing-library/react';
import LadderForm from '../../components/LadderForm';
import * as storageService from '../../services/storageService';
import * as dataService from '../../services/dataService';
import '@testing-library/jest-dom';

// Completely manual mock - no importActual to avoid real localStorage reads
vi.mock('../../services/storageService', () => {
  const m = vi.fn;
  return {
    derivePrefixFromLocation: m(),
    getKeyPrefix: m().mockReturnValue('test_'),
    getJson: m(),
    setJson: m(),
    removeJson: m(),
    getJsonArray: m().mockReturnValue([]),
    getLocalPlayers: m().mockReturnValue([]),
    removeAllKeysWithPrefix: m(),
    isAdminMode: m().mockReturnValue(true),
    setAdminMode: m(),
    clearAdminMode: m(),
    getPendingNewDay: m().mockReturnValue(null),
    setPendingNewDay: m(),
    clearPendingNewDay: m(),
    clearSettings: m(),
    isCellSaved: m().mockReturnValue(false),
    markCellAsSaved: m(),
    markCellAsUnsaved: m(),
    clearAllSaveStatus: m(),
    markLocalChanges: m(),
    getHasLocalChanges: m().mockReturnValue(false),
    clearLocalChangesFlag: m(),
    getServerDownMode: m().mockReturnValue(false),
    addPendingSync: m(),
    clearPendingSyncQueue: m(),
    getPendingSyncQueue: m().mockReturnValue([]),
    hasPendingSync: m().mockReturnValue(false),
    getPendingSyncCount: m().mockReturnValue(0),
    addDelta: m(),
    getPendingDeltaCount: m().mockReturnValue(0),
    queueDelete: m(),
    getPendingDeletes: m().mockReturnValue(new Set()),
    clearPendingDeletes: m(),
    replayPendingDeletes: m().mockResolvedValue(undefined),
    startBatch: m(),
    endBatch: m().mockResolvedValue(undefined),
    isInBatch: m().mockReturnValue(false),
    _resetBatchState: m(),
    getPlayers: m().mockResolvedValue([]),
    savePlayers: m().mockResolvedValue({ success: true, serverSynced: true }),
    getPlayer: m().mockResolvedValue(undefined),
    updatePlayer: m().mockResolvedValue(undefined),
    clearPlayerCell: m().mockResolvedValue(undefined),
    submitGameResult: m().mockResolvedValue(undefined),
    getSettings: m().mockReturnValue({}),
    saveSettings: m(),
    getProjectName: m().mockReturnValue('Bughouse Chess Ladder'),
    setProjectName: m(),
    getZoomLevel: m().mockReturnValue(100),
    setZoomLevel: m(),
    clearAllData: m().mockResolvedValue(undefined),
    saveToServer: m().mockResolvedValue({ success: true }),
    getClientId: m().mockReturnValue('test-client'),
    getClientName: m().mockReturnValue('Client test'),
    getServerUrl: m().mockReturnValue(null),
    tryAcquireAdminLock: m().mockResolvedValue(true),
    forceAcquireAdminLock: m().mockResolvedValue(true),
    releaseAdminLock: m().mockResolvedValue(undefined),
    refreshAdminLock: m().mockResolvedValue(undefined),
    getAdminLockInfo: m().mockResolvedValue({ locked: false }),
   isAdminLocked: m().mockResolvedValue(false),
    checkWritePermission: m().mockResolvedValue(true),
    isTournamentActive: m().mockReturnValue(false),
    getTournamentState: m().mockReturnValue(null),
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
    getTournamentStatus: vi.fn().mockResolvedValue({ active: false }),
    startTournament: vi.fn().mockResolvedValue({ active: true }),
    endTournament: vi.fn().mockResolvedValue(undefined),
    saveMiniGameFile: vi.fn().mockResolvedValue(undefined),
    copyPlayersToMiniGame: vi.fn().mockResolvedValue(undefined),
    exportTournamentFiles: vi.fn().mockResolvedValue(new Blob()),
    generateTrophyReport: vi.fn().mockResolvedValue(new Blob()),
  },
  DataServiceMode: {
    LOCAL: 'LOCAL',
    DEVELOPMENT: 'DEVELOPMENT',
    SERVER: 'SERVER',
  },
}));

vi.mock('../../services/userSettingsStorage', () => ({
  loadUserSettings: vi.fn().mockReturnValue({ server: '', apiKey: '' }),
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
    (globalThis as any).__capturedOnAutoLetter = onAutoLetter;
    return <div data-testid="mock-menubar">MenuBar</div>;
  },
}));

describe('LadderForm Auto-Letter Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (globalThis as any).__capturedOnAutoLetter = undefined;
    (storageService.isAdminMode as any).mockReturnValue(true);
  });

  it('should use nRating if available and non-zero, otherwise use rating', async () => {
    const mockPlayers = [
      { rank: 1, group: 'D', lastName: 'User1', firstName: 'F1', rating: 1200, nRating: 1300, trophyEligible: true, grade: 'A', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: [] as (string | null)[] },
      { rank: 2, group: 'D', lastName: 'User2', firstName: 'F2', rating: 800, nRating: 0, trophyEligible: true, grade: 'B', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: [] as (string | null)[] },
    ];
    (storageService.getLocalPlayers as any).mockImplementation(() => mockPlayers);

    render(<LadderForm />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-menubar')).toBeInTheDocument();
    });

    const onAutoLetter = (globalThis as any).__capturedOnAutoLetter;
    expect(onAutoLetter).toBeDefined();

    onAutoLetter();

    await waitFor(() => {
      expect(storageService.savePlayers).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ rank: 1, group: 'A1' }), // 1300 -> A1
          expect.objectContaining({ rank: 2, group: 'B' }), // 800 -> B
        ]),
        true
      );
    });
  });

  it('should use rating if nRating is zero', async () => {
    const mockPlayers = [
      { rank: 1, group: 'D', lastName: 'User1', firstName: 'F1', rating: 1200, nRating: 0, trophyEligible: true, grade: 'A', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: [] as (string | null)[] },
      { rank: 2, group: 'D', lastName: 'User2', firstName: 'F2', rating: 800, nRating: 0, trophyEligible: true, grade: 'B', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: [] as (string | null)[] },
    ];
    (storageService.getLocalPlayers as any).mockImplementation(() => mockPlayers);

    render(<LadderForm />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-menubar')).toBeInTheDocument();
    });

    const onAutoLetter = (globalThis as any).__capturedOnAutoLetter;
    expect(onAutoLetter).toBeDefined();

    onAutoLetter();

    await waitFor(() => {
      expect(storageService.savePlayers).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ rank: 1, group: 'A1' }), // rating 1200 -> A1
          expect.objectContaining({ rank: 2, group: 'B' }), // rating 800 -> B
        ]),
        true
      );
    });
  });
});
