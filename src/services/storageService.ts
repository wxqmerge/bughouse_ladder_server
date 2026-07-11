/**
 * Storage Service - Wrapper for data persistence
 * 
 * This service provides a consistent API for data access that can
 * work with both localStorage (LOCAL mode) and the DataService (SERVER modes).
 * 
 * This is a transitional layer to help migrate from direct localStorage usage.
 */

import { PlayerData, DeltaOperation, DEFAULT_GAME_RESULTS } from '../../shared/types';
import { normalizeGrades } from '../../shared/utils/dedupUtils';
import { log } from '../utils/log';
import { shouldLog } from '../../shared/utils/debugUtils';
import { getDebugLevel } from '../utils/debug';
import { dataService, DataServiceMode } from './dataService';
import { loadUserSettings, normalizeServerUrl } from './userSettingsStorage';
import { isValidServerUrl } from '../utils/mode';
import { gatedFetch } from '../utils/requestGate';

// ==================== UTILITIES ====================

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
    return data ? JSON.parse(data) : null;
  } catch (error) {
    log('[STORAGE]', `Failed to parse JSON for key "${keyName}":`, error);
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
  return Array.isArray(data) ? normalizeGrades(data) : [];
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

export function setServerDownMode(isDown: boolean): void {
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
let deltaFlushFailures = 0;
const MAX_DELTA_FAILURES = 5;
const MAX_DELTA_QUEUE_SIZE = 500;

export function addDelta(op: DeltaOperation): void {
  if (deltaQueue.length >= MAX_DELTA_QUEUE_SIZE) {
    console.error('[STORAGE] Delta queue full (' + MAX_DELTA_QUEUE_SIZE + '). Dropping oldest entry. Server may be unreachable.');
    deltaQueue.shift();
  }
  deltaQueue.push(op);
}

async function flushDeltas(): Promise<void> {
  if (deltaQueue.length === 0) return;
  if (deltaFlushFailures >= MAX_DELTA_FAILURES) {
    console.error('[STORAGE] Delta flush disabled after ' + MAX_DELTA_FAILURES + ' consecutive failures. ' + deltaQueue.length + ' pending deltas may be lost. Fix server connection to resume.');
    return;
  }
  const batch = [...deltaQueue];
  try {
    if (dataService.getMode() !== DataServiceMode.LOCAL) {
      await dataService.submitDeltaBatch(batch);
    }
    deltaQueue = [];
    deltaFlushFailures = 0;
  } catch (error: any) {
    deltaFlushFailures++;
    console.error(`[STORAGE] Failed to flush deltas (attempt ${deltaFlushFailures}/${MAX_DELTA_FAILURES}), re-queueing:`, error);
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
  deleteChain = deleteChain.then(async () => {
    try {
      const userSettings = loadUserSettings();
      const serverUrl = userSettings.server?.trim();
      if (serverUrl) {
        await gatedFetch(`${serverUrl}/api/ladder/${playerRank}/round/${round}`, { method: 'DELETE' });
        const freshDeletes = new Set(getJsonArray<string>('ladder_pending_deletes'));
        freshDeletes.delete(key);
        setJson('ladder_pending_deletes', [...freshDeletes]);
      }
    } catch (err) {
      log('[STORAGE]', 'Delete queued for retry:', key);
    }
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
  for (const key of deletes) {
    const [rankStr, roundStr] = key.split(':');
    try {
      await gatedFetch(`${serverUrl}/api/ladder/${parseInt(rankStr)}/round/${parseInt(roundStr)}`, { method: 'DELETE' });
    } catch (err) {
      log('[STORAGE]', `Failed to replay delete ${key}:`, err);
    }
  }
  clearPendingDeletes();
}

// ==================== BATCH SYNC MANAGEMENT ====================

let batchOperationCount = 0;
let batchBuffer: PlayerData[] | null = null;

export function startBatch(): void {
  if (batchOperationCount === 0) batchBuffer = getJsonArray<PlayerData>('ladder_players');
  batchOperationCount++;
}

export async function endBatch(): Promise<void> {
  batchOperationCount--;
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
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('[STORAGE] Batch commit server sync failed — local data saved but server is stale:', error);
    }
  }
}

// ==================== PLAYER DATA ====================

export async function getPlayers(): Promise<PlayerData[]> {
  if (isInBatch() && batchBuffer !== null) return batchBuffer;
  if (dataService.getMode() === DataServiceMode.LOCAL) return getJsonArray<PlayerData>('ladder_players');
  try {
    return await dataService.getPlayers();
  } catch (error) {
    console.warn('[STORAGE] Server fetch failed, falling back to potentially stale localStorage data:', error);
    return getJsonArray<PlayerData>('ladder_players');
  }
}

export interface SaveResult {
  success: boolean;
  serverSynced: boolean;
  error?: string;
}

export async function savePlayers(players: PlayerData[], waitForServer = false, skipServerSync = false): Promise<SaveResult> {
  if (isInBatch()) {
    if (shouldLog(5)) console.debug('[SAVE] Batch mode — buffering ' + players.length + ' players');
    batchBuffer = players;
    return { success: true, serverSynced: false };
  }
  const mode = dataService.getMode();
  const userSettings = loadUserSettings();
  const serverUrl = userSettings.server?.trim() || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Debug-Level': String(getDebugLevel()) };
  if (userSettings.apiKey && userSettings.apiKey.trim()) {
    headers['X-API-Key'] = userSettings.apiKey.trim();
  }

  // Log game results being sent to server
  if (shouldLog(5)) {
    const affected = players.filter(p => p.gameResults && p.gameResults.some(r => r != null));
    for (const p of affected) {
      for (let r = 0; r < (p.gameResults?.length || 0); r++) {
        const val = p.gameResults?.[r];
        if (val) console.log(`[SAVE->SERVER] P${p.rank} R${r} = "${val}"`);
      }
    }
  }

  if (shouldLog(5)) console.debug('[SAVE] savePlayers: mode=' + mode + ', players=' + players.length + ', waitForServer=' + waitForServer + ', skipServerSync=' + skipServerSync);

  // Mini-game mode: save to mini-game endpoint, not main ladder
  const miniGameFile = dataService.getMiniGameFile();
  if (miniGameFile) {
    if (shouldLog(5)) console.debug('[SAVE] Mini-game mode: file=' + miniGameFile);
    setJson('ladder_players', players);
    if (shouldLog(5)) console.debug('[SAVE] Mini-game localStorage written');
    if (waitForServer) {
      const url = dataService.getConfigServerUrl();
      if (!url) {
        if (shouldLog(5)) console.debug('[SAVE] Mini-game: no server URL, skipping server sync');
        return { success: true, serverSynced: false, error: 'No server URL' };
      }
      if (shouldLog(5)) console.debug('[SAVE] Mini-game POST: ' + url + '/api/ladder/mini-games/write');
      const res = await gatedFetch(`${url}/api/ladder/mini-games/write`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ fileName: miniGameFile, players }),
      });
      if (res.ok) {
        if (shouldLog(5)) console.debug('[SAVE] Mini-game server sync OK');
        return { success: true, serverSynced: true };
      }
      let errorMsg = res.statusText;
      if (res.status === 401 || res.status === 403) {
        errorMsg = 'Write rejected by server. Check your API key in settings.';
      }
      if (shouldLog(5)) console.debug('[SAVE] Mini-game server sync FAILED: ' + res.status + ' ' + errorMsg);
      return { success: false, serverSynced: false, error: errorMsg };
    } else if (skipServerSync) {
      if (shouldLog(5)) console.debug('[SAVE] Mini-game: skipServerSync, server write skipped');
      return { success: true, serverSynced: false };
    } else {
      if (shouldLog(5)) console.debug('[SAVE] Mini-game: fire-and-forget server sync queued');
      (async () => {
        const url = dataService.getConfigServerUrl();
        if (url) {
          try {
            const res = await gatedFetch(`${url}/api/ladder/mini-games/write`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ fileName: miniGameFile, players }),
            });
            if (res.ok) {
              if (shouldLog(5)) console.debug('[SAVE] Mini-game fire-and-forget OK');
            } else {
              console.error('[SAVE] Mini-game fire-and-forget FAILED: ' + res.status + ' ' + res.statusText);
            }
          } catch (err: any) {
            console.error('[SAVE] Mini-game fire-and-forget ERROR: ' + err.message);
          }
        }
      })();
      return { success: true, serverSynced: false };
    }
  }

  if (mode === DataServiceMode.LOCAL && !serverUrl) {
    if (shouldLog(5)) console.debug('[SAVE] LOCAL mode: writing ' + players.length + ' players to localStorage');
    setJson('ladder_players', players);
    for (const p of players) {
      if (p.gameResults) {
        for (let r = 0; r < p.gameResults.length; r++) {
          if (p.gameResults[r]) markCellAsSaved(p.rank, r);
        }
      }
    }
    if (shouldLog(5)) console.debug('[SAVE] LOCAL mode: save complete');
    return { success: true, serverSynced: true };
  } else {
    if (shouldLog(5)) console.debug('[SAVE] SERVER mode: writing ' + players.length + ' players to localStorage + server');
    setJson('ladder_players', players);
    if (shouldLog(5)) console.debug('[SAVE] SERVER mode: localStorage written');
    if (waitForServer) {
      const url = dataService.getConfigServerUrl();
      if (!url) {
        if (shouldLog(5)) console.debug('[SAVE] SERVER mode: no server URL, skipping server sync');
        return { success: true, serverSynced: false, error: 'No server URL' };
      }
      if (shouldLog(5)) console.debug('[SAVE] SERVER mode PUT: ' + url + '/api/ladder');
      const res = await gatedFetch(`${url}/api/ladder`, { method: 'PUT', headers, body: JSON.stringify({ players }) });
      if (res.ok) {
        dataService.resetHashPublic();
        if (shouldLog(5)) console.debug('[SAVE] SERVER mode: server sync OK, hash reset');
        return { success: true, serverSynced: true };
      }
      let errorMsg = res.statusText;
      if (res.status === 401 || res.status === 403) {
        errorMsg = 'Write rejected by server. Check your API key in settings.';
      }
      if (shouldLog(5)) console.debug('[SAVE] SERVER mode: server sync FAILED: ' + res.status + ' ' + errorMsg);
      return { success: false, serverSynced: false, error: errorMsg };
    } else if (skipServerSync) {
      if (shouldLog(5)) console.debug('[SAVE] SERVER mode: skipServerSync, server write skipped');
      return { success: true, serverSynced: false };
    } else {
      if (shouldLog(5)) console.debug('[SAVE] SERVER mode: fire-and-forget server sync queued');
      (async () => {
        const url = dataService.getConfigServerUrl();
        if (url) {
          try {
            const res = await gatedFetch(`${url}/api/ladder`, { method: 'PUT', headers, body: JSON.stringify({ players }) });
            if (res.ok) {
              dataService.resetHashPublic();
              if (shouldLog(5)) console.debug('[SAVE] SERVER mode: fire-and-forget OK, hash reset');
            } else {
              console.error('[SAVE] SERVER mode: fire-and-forget FAILED: ' + res.status + ' ' + res.statusText);
            }
          } catch (err: any) {
            console.error('[SAVE] SERVER mode: fire-and-forget ERROR: ' + err.message);
          }
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
    if (!player.gameResults) player.gameResults = [...DEFAULT_GAME_RESULTS];
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
    if (!player.gameResults) player.gameResults = [...DEFAULT_GAME_RESULTS];
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
    const res = await gatedFetch(`${url}/api/ladder`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ players }) });
    return res.ok ? { success: true } : { success: false, error: res.statusText };
  } catch (e: any) { return { success: false, error: e.message }; }
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
    const raw = normalizeServerUrl(settings.server || '');
    if (!raw) return null;
    return isValidServerUrl(raw) ? raw : null;
  } catch { return null; }
}

export async function tryAcquireAdminLock(clientName?: string): Promise<boolean> {
  const url = getServerUrl();
  if (!url) return true;
  const id = getClientId();
  const name = clientName || getClientName(id);
  const settings = loadUserSettings();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey && settings.apiKey.trim()) {
    headers['X-API-Key'] = settings.apiKey.trim();
  }
  try {
    const res = await gatedFetch(`${url}/api/admin-lock/acquire`, { method: 'POST', headers, body: JSON.stringify({ clientId: id, clientName: name }) });
    if (!res.ok) {
      console.warn(`[STORAGE] Admin lock acquire failed: HTTP ${res.status}`);
      return false;
    }
    const data = await res.json();
    return data.success;
  } catch (e) {
    console.error('[STORAGE] Admin lock acquire request failed (server unreachable):', e);
    return false;
  }
}

export async function forceAcquireAdminLock(clientName?: string): Promise<boolean> {
  const url = getServerUrl();
  if (!url) return true;
  const id = getClientId();
  const name = clientName || getClientName(id);
  const settings = loadUserSettings();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey && settings.apiKey.trim()) {
    headers['X-API-Key'] = settings.apiKey.trim();
  }
  try {
    const res = await gatedFetch(`${url}/api/admin-lock/force`, { method: 'POST', headers, body: JSON.stringify({ clientId: id, clientName: name }) });
    if (!res.ok) {
      console.warn(`[STORAGE] Admin lock force-acquire failed: HTTP ${res.status}`);
      return false;
    }
    const data = await res.json();
    return data.success;
  } catch (e) {
    console.error('[STORAGE] Admin lock force-acquire request failed (server unreachable):', e);
    return false;
  }
}

export async function releaseAdminLock(): Promise<void> {
  const url = getServerUrl();
  if (!url) return;
  const settings = loadUserSettings();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey && settings.apiKey.trim()) {
    headers['X-API-Key'] = settings.apiKey.trim();
  }
  try { await gatedFetch(`${url}/api/admin-lock/release`, { method: 'POST', headers, body: JSON.stringify({ clientId: getClientId() }) }); } catch (e) { console.error('[STORAGE] Failed to release admin lock (lock may be orphaned on server):', e); }
}

export async function refreshAdminLock(): Promise<void> {
  const url = getServerUrl();
  if (!url) return;
  const settings = loadUserSettings();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.apiKey && settings.apiKey.trim()) {
    headers['X-API-Key'] = settings.apiKey.trim();
  }
  try { await gatedFetch(`${url}/api/admin-lock/refresh`, { method: 'POST', headers, body: JSON.stringify({ clientId: getClientId() }) }); } catch (e) { console.error('[STORAGE] Failed to refresh admin lock (lock may expire and orphan):', e); }
}

export async function getAdminLockInfo(): Promise<{ locked: boolean; holderId?: string; holderName?: string; expiresAt?: number; serverReachable?: boolean; adminBlocked?: boolean }> {
  const url = getServerUrl();
  if (!url) return { locked: false, serverReachable: true };
  const settings = loadUserSettings();
  const headers: Record<string, string> = {};
  if (settings.apiKey && settings.apiKey.trim()) {
    headers['X-API-Key'] = settings.apiKey.trim();
  }
  try {
    const res = await gatedFetch(`${url}/api/admin-lock/status`, { headers });
    if (res.status === 401 || res.status === 403) {
      return { locked: false, serverReachable: true, adminBlocked: true };
    }
    if (!res.ok) {
      return { locked: false, serverReachable: false };
    }
    const data = await res.json();
    return data.locked ? { locked: true, holderId: data.lock?.clientId, holderName: data.lock?.clientName, expiresAt: data.expiresAt, serverReachable: true } : { locked: false, serverReachable: true };
  } catch { return { locked: false, serverReachable: false }; }
}

export async function isAdminLocked(): Promise<boolean> {
  const info = await getAdminLockInfo();
  return info.locked;
}

export async function checkWritePermission(): Promise<boolean> {
  const url = getServerUrl();
  if (!url) { // console.log('[CHECK-WRITE] no server URL → true')
    return true; }
  const settings = loadUserSettings();
  if (!settings.apiKey || !settings.apiKey.trim()) { // console.log('[CHECK-WRITE] no API key → false')
    return false; }
  // console.log('[CHECK-WRITE] has API key → true')
  return true;
}

