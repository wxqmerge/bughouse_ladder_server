/**
 * Storage Service - Wrapper for data persistence
 * 
 * This service provides a consistent API for data access that can
 * work with both localStorage (LOCAL mode) and the DataService (SERVER modes).
 * 
 * This is a transitional layer to help migrate from direct localStorage usage.
 */

import { PlayerData, DeltaOperation } from '../../shared/types';
import { log } from '../utils/log';
import { dataService, DataServiceMode } from './dataService';
import { loadUserSettings, normalizeServerUrl } from './userSettingsStorage';

// ==================== UTILITIES ====================

export function buildAuthHeaders(includeContentType = true): Record<string, string> {
  const settings = loadUserSettings();
  const headers: Record<string, string> = includeContentType ? { 'Content-Type': 'application/json' } : {};
  if (settings.apiKey && settings.apiKey.trim()) {
    headers['X-API-Key'] = settings.apiKey.trim();
  }
  console.log('[AUTH-HEADERS] apiKey present:', !!settings.apiKey?.trim(), 'keys:', Object.keys(headers));
  return headers;
}

export function derivePrefixFromLocation(hostname: string, pathname: string): string {
  const host = hostname.replace(/[.\-:]/g, '_');
  const path = pathname
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const combined = host + (path ? '_' + path : '');
  return 'ladder_' + combined + '_';
}

export function getKeyPrefix(): string {
  return derivePrefixFromLocation(window.location.hostname, window.location.pathname);
}

function buildKey(keyName: string): string {
  return getKeyPrefix() + keyName;
}

export function getJson<T = any>(keyName: string): T | null {
  try {
    const data = localStorage.getItem(buildKey(keyName));
    if (!data) return null;
    const parsed = JSON.parse(data);
    // Validate that we got the expected type
    if (keyName === 'ladder_players' && !Array.isArray(parsed)) {
      log('[STORAGE]', `Corrupt data for key "${keyName}" (expected array, got ${typeof parsed}) — clearing`);
      localStorage.removeItem(buildKey(keyName));
      return null;
    }
    return parsed as T;
  } catch (error) {
    log('[STORAGE]', `Failed to parse JSON for key "${keyName}":`, error);
    // Clear corrupt data so it doesn't block future operations
    localStorage.removeItem(buildKey(keyName));
    return null;
  }
}

export function setJson(keyName: string, value: any): void {
  try {
    localStorage.setItem(buildKey(keyName), JSON.stringify(value));
  } catch (error) {
    log('[STORAGE]', `Failed to save JSON for key "${keyName}":`, error);
  }
}

export function removeJson(keyName: string): void {
  localStorage.removeItem(buildKey(keyName));
}

export function getJsonArray<T = any>(keyName: string): T[] {
  const data = getJson<T[]>(keyName);
  return Array.isArray(data) ? data : [];
}

/**
 * Synchronously get players from localStorage (bypasses dataService)
 */
export function getLocalPlayers(): PlayerData[] {
  const data = getJson<PlayerData[]>('ladder_players');
  if (!Array.isArray(data)) return [];
  // Validate each player has required fields
  return data.filter((p: unknown): p is PlayerData => {
    if (!p || typeof p !== 'object') return false;
    const obj = p as Record<string, unknown>;
    return typeof obj.rank === 'number' && typeof obj.lastName === 'string' && typeof obj.firstName === 'string';
  });
}

/**
 * Remove all keys with the given prefix
 */
export function removeAllKeysWithPrefix(prefix: string): void {
  const keysToRemove: string[] = [];
  const preservedKeys = ['ladder_user_settings', 'ladder_last_working_config'];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const keyName = key.replace(prefix, '');
      if (!preservedKeys.includes(keyName)) {
        keysToRemove.push(key);
      }
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

// ==================== META-STATE STORAGE ====================

export function isAdminMode(): boolean {
  return getJson<boolean>('ladder_admin_mode') === true;
}

export function setAdminMode(isAdmin: boolean): void {
  setJson('ladder_admin_mode', isAdmin);
}

export function clearAdminMode(): void {
  removeJson('ladder_admin_mode');
}

export function getPendingNewDay(): any {
  return getJson('ladder_pending_newday');
}

export function setPendingNewDay(data: any): void {
  setJson('ladder_pending_newday', data);
}

export function clearPendingNewDay(): void {
  removeJson('ladder_pending_newday');
}

export function clearSettings(): void {
  removeJson('ladder_settings');
}

// ==================== TOURNAMENT STATE STORAGE ====================

export interface TournamentState {
  active: boolean;
  startedAt: string;
}

export function getTournamentState(): TournamentState | null {
  return getJson<TournamentState>('ladder_tournament_state');
}

export function setTournamentState(state: TournamentState): void {
  setJson('ladder_tournament_state', state);
}

export function clearTournamentState(): void {
  removeJson('ladder_tournament_state');
}

export function isTournamentActive(): boolean {
  const state = getTournamentState();
  return state?.active === true;
}

// ==================== SAVE STATUS TRACKING ====================

const saveStatusMap = new Map<string, boolean>();

function getSaveStatusKey(playerRank: number, round: number): string {
  return `${playerRank}:${round}`;
}

export function isCellSaved(playerRank: number, round: number): boolean {
  return saveStatusMap.get(getSaveStatusKey(playerRank, round)) === true;
}

export function markCellAsSaved(playerRank: number, round: number): void {
  saveStatusMap.set(getSaveStatusKey(playerRank, round), true);
}

export function markCellAsUnsaved(playerRank: number, round: number): void {
  saveStatusMap.set(getSaveStatusKey(playerRank, round), false);
}

export function clearAllSaveStatus(): void {
  saveStatusMap.clear();
}

// ==================== LOCAL CHANGES TRACKING ====================

let hasLocalChanges = false;
let serverDownMode = false;

export function markLocalChanges(): void {
  if (!hasLocalChanges) {
    hasLocalChanges = true;
    log('[STORAGE]', 'Local changes detected');
  }
}

export function getHasLocalChanges(): boolean {
  return hasLocalChanges;
}

export function clearLocalChangesFlag(): void {
  hasLocalChanges = false;
  log('[STORAGE]', 'Local changes synced to server');
}

function setServerDownMode(isDown: boolean): void {
  serverDownMode = isDown;
  log('[STORAGE]', 'Server down mode: ' + (isDown ? 'ON' : 'OFF'));
}

export function getServerDownMode(): boolean {
  return serverDownMode;
}

// ==================== PENDING SYNC QUEUE ====================

interface PendingSyncEntry {
  playerRank: number;
  round: number;
  result: string;
  timestamp: number;
}

let pendingSyncQueue: PendingSyncEntry[] = [];

function loadPendingSyncQueue(): void {
  const stored = getJsonArray<PendingSyncEntry>('ladder_pending_sync');
  if (stored.length > 0) {
    pendingSyncQueue = stored;
    log('[STORAGE]', 'Loaded ' + pendingSyncQueue.length + ' pending sync entries');
  }
}

function savePendingSyncQueue(): void {
  setJson('ladder_pending_sync', pendingSyncQueue);
}

export function addPendingSync(playerRank: number, round: number, result: string): void {
  const existingIndex = pendingSyncQueue.findIndex(
    e => e.playerRank === playerRank && e.round === round
  );
  if (existingIndex >= 0) {
    pendingSyncQueue[existingIndex] = { playerRank, round, result, timestamp: Date.now() };
  } else {
    pendingSyncQueue.push({ playerRank, round, result, timestamp: Date.now() });
  }
  savePendingSyncQueue();
}

export function clearPendingSyncQueue(): void {
  pendingSyncQueue = [];
  savePendingSyncQueue();
}

export function getPendingSyncQueue(): PendingSyncEntry[] {
  return [...pendingSyncQueue];
}

export function hasPendingSync(): boolean {
  return pendingSyncQueue.length > 0;
}

export function getPendingSyncCount(): number {
  return pendingSyncQueue.length;
}

loadPendingSyncQueue();

// ==================== DELTA QUEUE (Buffered Sync) ====================

let deltaQueue: DeltaOperation[] = [];
let flushInterval: ReturnType<typeof setInterval> | null = null;

export function addDelta(op: DeltaOperation): void {
  deltaQueue.push(op);
}

async function flushDeltas(): Promise<void> {
  if (deltaQueue.length === 0) return;
  const batch = [...deltaQueue];
  try {
    if (dataService.getMode() !== DataServiceMode.LOCAL) {
      await dataService.submitDeltaBatch(batch);
    }
    deltaQueue = [];
  } catch (error: any) {
    log('[STORAGE]', 'Failed to flush deltas, re-queueing:', error);
  }
}

if (typeof window !== 'undefined') {
  flushInterval = setInterval(flushDeltas, 5000);
}

export function getPendingDeltaCount(): number {
  return deltaQueue.length;
}

export function stopDeltaFlushing(): void {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
}

// ==================== PENDING DELETES TRACKING ====================

let deleteChain = Promise.resolve();

export function queueDelete(playerRank: number, round: number): void {
  const key = `${playerRank}:${round}`;
  let deletes = new Set(getJsonArray<string>('ladder_pending_deletes'));
  deletes.add(key);
  setJson('ladder_pending_deletes', [...deletes]);
  deleteChain = deleteChain
    .then(async () => {
      try {
        const userSettings = loadUserSettings();
        const serverUrl = userSettings.server?.trim();
        if (serverUrl) {
          const headers = buildAuthHeaders();
          await fetch(`${serverUrl}/api/ladder/${playerRank}/round/${round}`, { method: 'DELETE', headers });
          const freshDeletes = new Set(getJsonArray<string>('ladder_pending_deletes'));
          freshDeletes.delete(key);
          setJson('ladder_pending_deletes', [...freshDeletes]);
        }
      } catch (err) {
        log('[STORAGE]', 'Delete queued for retry:', key);
      }
    })
    .catch((_err) => {
      deleteChain = Promise.resolve();
    });
}

export function getPendingDeletes(): Set<string> {
  return new Set(getJsonArray<string>('ladder_pending_deletes'));
}

export function clearPendingDeletes(): void {
  removeJson('ladder_pending_deletes');
}

export async function replayPendingDeletes(): Promise<void> {
  const deletes = getPendingDeletes();
  if (deletes.size === 0) return;
  const userSettings = loadUserSettings();
  const serverUrl = userSettings.server?.trim();
  if (!serverUrl) return;
  const headers = buildAuthHeaders();
  const failed = new Set<string>();
  for (const key of deletes) {
    const [rankStr, roundStr] = key.split(':');
    try {
      const res = await fetch(`${serverUrl}/api/ladder/${parseInt(rankStr, 10)}/round/${parseInt(roundStr, 10)}`, { method: 'DELETE', headers });
      if (!res.ok) {
        failed.add(key);
        log('[STORAGE]', `Failed to replay delete ${key}: HTTP ${res.status}`);
      }
    } catch (err) {
      failed.add(key);
      log('[STORAGE]', `Failed to replay delete ${key}:`, err);
    }
  }
  if (failed.size === 0) {
    clearPendingDeletes();
  } else if (failed.size < deletes.size) {
    setJson('ladder_pending_deletes', [...failed]);
    log('[STORAGE]', `Partial replay: ${failed.size} deletes remain pending`);
  } else {
    log('[STORAGE]', `All ${failed.size} deletes failed — keeping pending queue intact`);
  }
}

// ==================== BATCH SYNC MANAGEMENT ====================

let batchOperationCount = 0;
let batchBuffer: PlayerData[] | null = null;
let batchTimeoutId: ReturnType<typeof setTimeout> | null = null;

export function startBatch(): void {
  if (batchOperationCount === 0) batchBuffer = getJsonArray<PlayerData>('ladder_players');
  batchOperationCount++;
  console.log('[BATCH] startBatch → count=', batchOperationCount);
  if (batchTimeoutId) clearTimeout(batchTimeoutId);
  batchTimeoutId = setTimeout(() => {
    if (batchOperationCount > 0) {
      console.error('[BATCH] Timeout! Batch count stuck at', batchOperationCount, '— committing buffer then resetting');
      if (batchBuffer !== null) {
        setJson('ladder_players', batchBuffer);
        log('[STORAGE]', 'Batch timeout: saved buffer to localStorage to avoid data loss');
      }
      batchOperationCount = 0;
      batchBuffer = null;
      batchTimeoutId = null;
      markLocalChanges();
    }
  }, 30000);
}

export async function endBatch(): Promise<void> {
  batchOperationCount--;
  console.log('[BATCH] endBatch → count=', batchOperationCount);
  if (batchOperationCount < 0) {
    console.warn('[BATCH] endBatch called more than startBatch — resetting count to 0');
    batchOperationCount = 0;
  }
  if (batchTimeoutId) {
    clearTimeout(batchTimeoutId);
    batchTimeoutId = null;
  }
  if (batchOperationCount === 0 && batchBuffer !== null) {
    await commitBatchBuffer();
    batchBuffer = null;
  }
}

export function isInBatch(): boolean { return batchOperationCount > 0; }

export function _resetBatchState(): void {
  batchOperationCount = 0;
  batchBuffer = null;
}

function getCurrentPlayers(): PlayerData[] {
  return batchBuffer !== null ? batchBuffer : getJsonArray<PlayerData>('ladder_players');
}

async function commitBatchBuffer(): Promise<void> {
  if (!batchBuffer) return;
  setJson('ladder_players', batchBuffer);
  if (dataService.getMode() !== DataServiceMode.LOCAL) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      await dataService.savePlayers(batchBuffer);
      clearTimeout(timeoutId);
      log('[STORAGE]', 'Batch buffer committed to server');
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('[STORAGE][BATCH] Server sync failed — localStorage has data but server is out of sync:', error?.message ?? error);
      markLocalChanges();
    }
  }
}

// ==================== PLAYER DATA ====================

export async function getPlayers(): Promise<PlayerData[]> {
  if (isInBatch() && batchBuffer !== null) return batchBuffer;
  if (dataService.getMode() === DataServiceMode.LOCAL) return getJsonArray<PlayerData>('ladder_players');
  try {
    return await dataService.getPlayers();
  } catch (error: any) {
    const status = error?.status ?? 0;
    if (status === 401 || status === 403) {
      console.error('[STORAGE][GET] Auth rejected (HTTP', status, ') — API key may be invalid');
    } else {
      console.warn('[STORAGE][GET] Server fetch failed, falling back to localStorage:', error?.message ?? error);
    }
    return getJsonArray<PlayerData>('ladder_players');
  }
}

export interface SaveResult {
  success: boolean;
  serverSynced: boolean;
  error?: string;
}

export async function savePlayers(players: PlayerData[], waitForServer = false, skipServerSync = false): Promise<SaveResult> {
  if (isInBatch()) { batchBuffer = players; return { success: true, serverSynced: false }; }
  const mode = dataService.getMode();
  const userSettings = loadUserSettings();
  const serverUrl = userSettings.server?.trim() || '';
  const headers = buildAuthHeaders();
  
  if (mode === DataServiceMode.LOCAL && !serverUrl) {
    setJson('ladder_players', players);
    for (const p of players) {
      if (p.gameResults) {
        for (let r = 0; r < p.gameResults.length; r++) {
          if (p.gameResults[r]) markCellAsSaved(p.rank, r);
        }
      }
    }
    return { success: true, serverSynced: true };
  } else {
    setJson('ladder_players', players);
    if (waitForServer) {
      const url = dataService.getConfigServerUrl();
      if (!url) return { success: true, serverSynced: false, error: 'No server URL' };
      const res = await fetch(`${url}/api/ladder`, { method: 'PUT', headers, body: JSON.stringify({ players }) });
      if (res.ok) {
        dataService.resetHashPublic();
        return { success: true, serverSynced: true };
      }
      let errorMsg = res.statusText;
      if (res.status === 401 || res.status === 403) {
        errorMsg = 'Write rejected by server. Check your API key in settings.';
      }
      return { success: false, serverSynced: false, error: errorMsg };
    } else if (skipServerSync) {
      return { success: true, serverSynced: false };
    } else {
      (async () => {
        const url = dataService.getConfigServerUrl();
        if (url) {
          const res = await fetch(`${url}/api/ladder`, { method: 'PUT', headers, body: JSON.stringify({ players }) });
          if (res.ok) dataService.resetHashPublic();
        }
      })();
      return { success: true, serverSynced: false };
    }
  }
}

export async function getPlayer(rank: number): Promise<PlayerData | undefined> {
  const players = await getPlayers();
  return players.find(p => p.rank === rank);
}

export async function updatePlayer(player: PlayerData): Promise<void> {
  const players = isInBatch() ? getCurrentPlayers() : await getPlayers();
  const index = players.findIndex(p => p.rank === player.rank);
  if (index !== -1) {
    players[index] = player;
    if (dataService.getMode() === DataServiceMode.LOCAL) {
      await savePlayers(players);
    } else {
      await savePlayers(players, false, true);
      addDelta({ type: 'PLAYER_UPDATE', player });
    }
  }
}

export async function clearPlayerCell(playerRank: number, roundIndex: number): Promise<void> {
  const players = isInBatch() ? getCurrentPlayers() : await getPlayers();
  const player = players.find(p => p.rank === playerRank);
  if (player) {
    if (!player.gameResults) player.gameResults = new Array(31).fill(null);
    player.gameResults[roundIndex] = null;
    if (dataService.getMode() === DataServiceMode.LOCAL) {
      await savePlayers(players);
      markCellAsSaved(playerRank, roundIndex);
    } else {
      await savePlayers(players, false, true);
      markCellAsUnsaved(playerRank, roundIndex);
      addDelta({ type: 'CLEAR_CELL', playerRank, round: roundIndex });
    }
  }
}

export async function submitGameResult(playerRank: number, round: number, result: string): Promise<void> {
  const players = isInBatch() ? getCurrentPlayers() : await getPlayers();
  const player = players.find(p => p.rank === playerRank);
  if (player) {
    if (!player.gameResults) player.gameResults = new Array(31).fill(null);
    player.gameResults[round] = result;
    if (dataService.getMode() === DataServiceMode.LOCAL) {
      await savePlayers(players);
      markCellAsSaved(playerRank, round);
    } else {
      await savePlayers(players, false, true);
      markCellAsUnsaved(playerRank, round);
      addDelta({ type: 'GAME_RESULT', playerRank, round, result });
    }
  }
}

// ==================== SETTINGS ====================

export function getSettings(): any { return getJson('ladder_settings') || {}; }
export function saveSettings(settings: any): void { setJson('ladder_settings', settings); }
export function getProjectName(): string { return getJson<string>('ladder_project_name') || 'Bughouse Chess Ladder'; }
export function setProjectName(name: string): void { setJson('ladder_project_name', name); }
export function getZoomLevel(): number { return getJson<number>('ladder_zoom') ?? 100; }
export function setZoomLevel(level: number): void { setJson('ladder_zoom', level); }

// ==================== UTILITY ====================

export async function clearAllData(): Promise<void> {
  removeJson('ladder_players');
  removeJson('ladder_settings');
  removeJson('ladder_project_name');
  removeJson('ladder_zoom');
}

export async function saveToServer(): Promise<{ success: boolean; error?: string }> {
  const players = await getPlayers();
  if (dataService.getMode() === DataServiceMode.LOCAL) return { success: true };
  try {
    const url = dataService.getConfigServerUrl();
    if (!url) return { success: false, error: 'No server URL' };
    const res = await fetch(`${url}/api/ladder`, { method: 'PUT', headers: buildAuthHeaders(), body: JSON.stringify({ players }) });
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }
    return { success: true };
  } catch (e: any) { return { success: false, error: e?.message ?? 'Network error' }; }
}

// ==================== ADMIN LOCK MANAGEMENT ====================

export function getClientId(): string {
  let id = sessionStorage.getItem('ladder_client_id');
  if (!id) { id = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; sessionStorage.setItem('ladder_client_id', id); }
  return id;
}

export function getClientName(clientId: string): string { return `Client ${clientId.substr(-4)}`; }

export function getServerUrl(): string | null {
  try {
    const settings = loadUserSettings();
    return normalizeServerUrl(settings.server || '') || null;
  } catch { return null; }
}

export interface AdminLockResult {
  acquired: boolean;
  reason?: 'success' | 'held' | 'server_error' | 'network_error' | 'unreachable';
}

export async function tryAcquireAdminLock(clientName?: string): Promise<AdminLockResult> {
  const url = getServerUrl();
  if (!url) return { acquired: true, reason: 'success' };
  const id = getClientId();
  const name = clientName || getClientName(id);
  const headers = buildAuthHeaders();
  try {
    const res = await fetch(`${url}/api/admin-lock/acquire`, { method: 'POST', headers, body: JSON.stringify({ clientId: id, clientName: name }) });
    console.log('[ADMIN-LOCK] acquire response:', res.status, res.ok ? 'ok' : 'FAIL');
    if (res.status === 409) return { acquired: false, reason: 'held' };
    if (!res.ok) return { acquired: false, reason: 'server_error' };
    const data = await res.json();
    console.log('[ADMIN-LOCK] acquire data:', JSON.stringify(data));
    return { acquired: data.success, reason: data.success ? 'success' : 'server_error' };
  } catch (e) {
    console.log('[ADMIN-LOCK] acquire error:', e);
    return { acquired: false, reason: 'network_error' };
  }
}

export async function forceAcquireAdminLock(clientName?: string): Promise<boolean> {
  const url = getServerUrl();
  if (!url) return true;
  const id = getClientId();
  const name = clientName || getClientName(id);
  const headers = buildAuthHeaders();
  try {
    const res = await fetch(`${url}/api/admin-lock/force`, { method: 'POST', headers, body: JSON.stringify({ clientId: id, clientName: name }) });
    if (!res.ok) {
      console.warn('[ADMIN_LOCK] force acquire failed:', res.status);
      return false;
    }
    const data = await res.json();
    return data.success;
  } catch (e) {
    console.error('[ADMIN_LOCK] force acquire error:', e);
    return false;
  }
}

export async function releaseAdminLock(): Promise<void> {
  const url = getServerUrl();
  if (!url) return;
  const headers = buildAuthHeaders();
  try {
    const res = await fetch(`${url}/api/admin-lock/release`, { method: 'POST', headers, body: JSON.stringify({ clientId: getClientId() }) });
    if (!res.ok && res.status !== 401) {
      console.warn('[ADMIN_LOCK] release failed:', res.status);
    }
  } catch (e) {
    console.warn('[ADMIN_LOCK] release network error:', (e as Error).message);
  }
}

export async function refreshAdminLock(): Promise<void> {
  const url = getServerUrl();
  if (!url) return;
  const headers = buildAuthHeaders();
  try {
    const res = await fetch(`${url}/api/admin-lock/refresh`, { method: 'POST', headers, body: JSON.stringify({ clientId: getClientId() }) });
    if (!res.ok && res.status !== 401) {
      console.warn('[ADMIN_LOCK] refresh failed:', res.status);
    }
  } catch (e) {
    console.warn('[ADMIN_LOCK] refresh network error:', (e as Error).message);
  }
}

export async function getAdminLockInfo(): Promise<{ locked: boolean; holderId?: string; holderName?: string; expiresAt?: number; serverReachable?: boolean; adminBlocked?: boolean; missingKey?: boolean }> {
  const url = getServerUrl();
  if (!url) return { locked: false, serverReachable: true };
  const headers = buildAuthHeaders(false);
  console.log('[ADMIN-LOCK-STATUS] requesting status...');
  try {
    const res = await fetch(`${url}/api/admin-lock/status`, { headers });
    console.log('[ADMIN-LOCK-STATUS] response:', res.status);

    if (!res.ok && res.status !== 401 && res.status !== 403) {
      return { locked: false, serverReachable: false };
    }

    const data = await res.json();
    console.log('[ADMIN-LOCK-STATUS] data:', JSON.stringify(data));

    // Server has no admin key configured at all
    if (data.adminConfigured === false) {
      return { locked: false, serverReachable: true, adminBlocked: true };
    }

    // Client didn't send a valid key
    if (data.hasValidKey === false) {
      return { locked: false, serverReachable: true, missingKey: true };
    }

    // Authenticated — normal lock info
    return data.locked
      ? { locked: true, holderId: data.lock?.clientId, holderName: data.lock?.clientName, expiresAt: data.expiresAt, serverReachable: true }
      : { locked: false, serverReachable: true };
  } catch (e) {
    console.log('[ADMIN-LOCK-STATUS] fetch error:', e);
    return { locked: false, serverReachable: false };
  }
}

export async function isAdminLocked(): Promise<boolean> {
  const info = await getAdminLockInfo();
  return info.locked;
}

// Legacy compatibility wrapper
export async function tryAcquireAdminLockLegacy(clientName?: string): Promise<boolean> {
  const result = await tryAcquireAdminLock(clientName);
  return result.acquired;
}

export async function checkWritePermission(): Promise<boolean> {
  const url = getServerUrl();
  if (!url) { console.log('[CHECK-WRITE] no server URL → true (local mode)'); return true; }
  const settings = loadUserSettings();
  if (!settings.apiKey || !settings.apiKey.trim()) { console.log('[CHECK-WRITE] no API key → false'); return false; }
  try {
    const res = await fetch(`${url}/api/ladder`, {
      method: 'GET',
      headers: buildAuthHeaders(false),
    });
    if (res.status === 401 || res.status === 403) {
      console.warn('[CHECK-WRITE] server rejected read — API key likely invalid');
      return false;
    }
    console.log('[CHECK-WRITE] has API key, server reachable (note: GET is public, write not verified)');
    return true;
  } catch (e) {
    console.warn('[CHECK-WRITE] server unreachable, assuming false:', e);
    return false;
  }
}

