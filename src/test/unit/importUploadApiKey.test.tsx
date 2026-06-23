import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, screen, fireEvent } from '@testing-library/react';
import LadderForm from '../../components/LadderForm';
import * as storageService from '../../services/storageService';
import * as dataService from '../../services/dataService';
import * as userSettingsStorage from '../../services/userSettingsStorage';
import '@testing-library/jest-dom';

// Mock storageService
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
    getServerUrl: m(),
    tryAcquireAdminLock: m().mockResolvedValue(true),
    forceAcquireAdminLock: m().mockResolvedValue(true),
    releaseAdminLock: m().mockResolvedValue(undefined),
    refreshAdminLock: m().mockResolvedValue(undefined),
    getAdminLockInfo: m().mockResolvedValue({ locked: false }),
    isAdminLocked: m().mockResolvedValue(false),
    checkWritePermission: m().mockResolvedValue(true),
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
  loadUserSettings: vi.fn().mockReturnValue({ server: 'http://localhost:3000', apiKey: 'test-admin-key' }),
  normalizeServerUrl: vi.fn((url) => url),
  saveUserSettings: vi.fn(),
  saveLastWorkingConfig: vi.fn(),
}));

vi.mock('../../utils/mode', () => ({
  getProgramMode: vi.fn().mockReturnValue('local'),
  isLocalMode: vi.fn().mockReturnValue(true),
  isServerDownMode: vi.fn().mockReturnValue(false),
  isValidServerUrl: vi.fn().mockReturnValue(true),
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

describe('Import Upload API Key', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    (globalThis as any).__capturedOnAutoLetter = undefined;
    // Re-setup all mocks after reset
    (storageService.isAdminMode as any).mockReturnValue(true);
    (storageService.getServerUrl as any).mockReturnValueOnce(null).mockReturnValue('http://localhost:3000');
    (storageService.getLocalPlayers as any).mockReturnValue([]);
    (storageService.getPlayers as any).mockResolvedValue([]);
    (storageService.savePlayers as any).mockResolvedValue({ success: true, serverSynced: true });
    (storageService.getProjectName as any).mockReturnValue('Bughouse Chess Ladder');
    (storageService.getZoomLevel as any).mockReturnValue(100);
    (storageService.getKeyPrefix as any).mockReturnValue('test_');
    (storageService.getSettings as any).mockReturnValue({});
    (storageService.isCellSaved as any).mockReturnValue(false);
    (storageService.getHasLocalChanges as any).mockReturnValue(false);
    (storageService.getServerDownMode as any).mockReturnValue(false);
    (storageService.getPendingSyncQueue as any).mockReturnValue([]);
    (storageService.hasPendingSync as any).mockReturnValue(false);
    (storageService.getPendingSyncCount as any).mockReturnValue(0);
    (storageService.getPendingDeltaCount as any).mockReturnValue(0);
    (storageService.getPendingDeletes as any).mockReturnValue(new Set());
    (storageService.getJsonArray as any).mockReturnValue([]);
    (storageService.tryAcquireAdminLock as any).mockResolvedValue(true);
    (storageService.forceAcquireAdminLock as any).mockResolvedValue(true);
    (storageService.releaseAdminLock as any).mockResolvedValue(undefined);
    (storageService.refreshAdminLock as any).mockResolvedValue(undefined);
    (storageService.getAdminLockInfo as any).mockResolvedValue({ locked: false });
    (storageService.isAdminLocked as any).mockResolvedValue(false);
    (storageService.checkWritePermission as any).mockResolvedValue(true);
    (storageService.getClientId as any).mockReturnValue('test-client');
    (storageService.getClientName as any).mockReturnValue('Client test');
    (storageService.endBatch as any).mockResolvedValue(undefined);
    (storageService.isInBatch as any).mockReturnValue(false);
    (storageService.saveToServer as any).mockResolvedValue({ success: true });
   (storageService.clearAllData as any).mockResolvedValue(undefined);
    (storageService.replayPendingDeletes as any).mockResolvedValue(undefined);
    // Reset loadUserSettings to default with API key
    (userSettingsStorage.loadUserSettings as any).mockReturnValue({ server: 'http://localhost:3000', apiKey: 'test-admin-key' });

    // Mock global fetch to capture upload requests
    fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      })
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should NOT send X-API-Key header when no API key configured', async () => {
    // Override loadUserSettings to return no API key
    (userSettingsStorage.loadUserSettings as any).mockReturnValue({ server: 'http://localhost:3000', apiKey: '' });

    const mockPlayers = [
      { rank: 1, group: 'D', lastName: 'User1', firstName: 'F1', rating: 1200, nRating: 0, trophyEligible: true, grade: 'A', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: [] as (string | null)[] },
      { rank: 2, group: 'D', lastName: 'User2', firstName: 'F2', rating: 800, nRating: 0, trophyEligible: true, grade: 'B', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: [] as (string | null)[] },
    ];
    (storageService.getLocalPlayers as any).mockImplementation(() => mockPlayers);

    render(<LadderForm />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-menubar')).toBeInTheDocument();
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeDefined();

    const tabContent = [
      'Group\tLastName\tFirstName\tRating\tRank\tNew Rating\tGrade\tNum Games\tAttendance\tPhone\tInfo\tSchool\tRoom\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12\t13\t14\t15\t16\t17\t18\t19\t20\t21\t22\t23\t24\t25\t26\t27\t28\t29\t30\t31',
      'D\tUser1\tF1\t1200\t1\t0\tA\t0\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t',
      'D\tUser2\tF2\t800\t2\t0\tB\t0\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t',
    ].join('\n');
    const testFile = new File([tabContent], 'test.tab', { type: 'text/tab-separated-values' });
    Object.defineProperty(fileInput, 'files', {
      value: [testFile],
      writable: true,
    });

    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(screen.queryByText('Confirm File Import')).toBeInTheDocument();
    }, { timeout: 5000 });

    const confirmBtn = screen.getByText('Accept & Save to Server');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      const uploadCall = fetchMock.mock.calls.find(
        (call: any[]) => call[0]?.toString().includes('/api/admin/upload')
      );
      expect(uploadCall).toBeDefined();
      const headers = uploadCall[1]?.headers;
      expect(headers).not.toHaveProperty('X-API-Key');
    }, { timeout: 5000 });
  });

  it('should send X-API-Key header when uploading import file', async () => {
    const mockPlayers = [
      { rank: 1, group: 'D', lastName: 'User1', firstName: 'F1', rating: 1200, nRating: 0, trophyEligible: true, grade: 'A', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: [] as (string | null)[] },
      { rank: 2, group: 'D', lastName: 'User2', firstName: 'F2', rating: 800, nRating: 0, trophyEligible: true, grade: 'B', num_games: 0, attendance: 0, info: '', phone: '', school: '', room: '', gameResults: [] as (string | null)[] },
    ];
    (storageService.getLocalPlayers as any).mockImplementation(() => mockPlayers);

    render(<LadderForm />);

    await waitFor(() => {
      expect(screen.getByTestId('mock-menubar')).toBeInTheDocument();
    });

    // Simulate file load by dispatching a File object to the hidden file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeDefined();

    // Create a valid .tab file content with header + 2 player rows
    const tabContent = [
      'Group\tLastName\tFirstName\tRating\tRank\tNew Rating\tGrade\tNum Games\tAttendance\tPhone\tInfo\tSchool\tRoom\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12\t13\t14\t15\t16\t17\t18\t19\t20\t21\t22\t23\t24\t25\t26\t27\t28\t29\t30\t31',
      'D\tUser1\tF1\t1200\t1\t0\tA\t0\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t',
      'D\tUser2\tF2\t800\t2\t0\tB\t0\t0\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t',
    ].join('\n');
    const testFile = new File([tabContent], 'test.tab', { type: 'text/tab-separated-values' });
    // jsdom doesn't support DataTransfer, use Object.assign to set files
    Object.defineProperty(fileInput, 'files', {
      value: [testFile],
      writable: true,
    });

    // Trigger change event
    fireEvent.change(fileInput);

    // Wait for import dialog to appear
    await waitFor(() => {
      expect(screen.queryByText('Confirm File Import')).toBeInTheDocument();
    }, { timeout: 5000 });

    // Click confirm button
    const confirmBtn = screen.getByText('Accept & Save to Server');
    fireEvent.click(confirmBtn);

    // Verify fetch was called with X-API-Key header
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      const uploadCall = fetchMock.mock.calls.find(
        (call: any[]) => call[0]?.toString().includes('/api/admin/upload')
      );
      expect(uploadCall).toBeDefined();
      const headers = uploadCall[1]?.headers;
      expect(headers).toHaveProperty('X-API-Key', 'test-admin-key');
    }, { timeout: 5000 });
  });
});
