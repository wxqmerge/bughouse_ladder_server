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
  return Array.isArray(data) ? data : [];
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
  deltaQueue = [];
  try {
    if (dataService.getMode() !== DataServiceMode.LOCAL) {
      await dataService.submitDeltaBatch(batch);
    }
  } catch (error: any) {
    log('[STORAGE]', 'Failed to flush deltas, re-queueing:', error);
    deltaQueue = [...batch, ...deltaQueue];
  }
}

if (typeof window !== 'undefined') {
  flushInterval = setInterval(flushDeltas, 5000);
}

export function getPendingDeltaCount(): number {
  return deltaQueue.length;
}

// ==================== PENDING DELETES TRACKING ====================

export function queueDelete(playerRank: number, round: number): void {
  const key = `${playerRank}:${round}`;
  let deletes = new Set(getJsonArray<string>('ladder_pending_deletes'));
  deletes.add(key);
  setJson('ladder_pending_deletes', [...deletes]);
  (async () => {
    try {
      const userSettings = loadUserSettings();
      const serverUrl = userSettings.server?.trim();
      if (serverUrl) {
        await fetch(`${serverUrl}/api/ladder/${playerRank}/round/${round}`, { method: 'DELETE' });
        deletes.delete(key);
        setJson('ladder_pending_deletes', [...deletes]);
      }
    } catch (err) {
      log('[STORAGE]', 'Delete queued for retry:', key);
    }
  })();
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
      await fetch(`${serverUrl}/api/ladder/${parseInt(rankStr)}/round/${parseInt(roundStr)}`, { method: 'DELETE' });
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
      const res = await fetch(`${url}/api/ladder`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ players }) });
      if (res.ok) {
        dataService.resetHashPublic();
        return { success: true, serverSynced: true };
      }
      return { success: false, serverSynced: false, error: res.statusText };
    } else if (skipServerSync) {
      return { success: true, serverSynced: false };
    } else {
      (async () => {
        const url = dataService.getConfigServerUrl();
        if (url) {
          const res = await fetch(`${url}/api/ladder`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ players }) });
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
    const res = await fetch(`${url}/api/ladder`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ players }) });
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
    return normalizeServerUrl(settings.server || '') || null;
  } catch { return null; }
}

export async function tryAcquireAdminLock(clientName?: string): Promise<boolean> {
  const url = getServerUrl();
  if (!url) return true;
  const id = getClientId();
  const name = clientName || getClientName(id);
  try {
    const res = await fetch(`${url}/api/admin-lock/acquire`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: id, clientName: name }) });
    const data = await res.json();
    return data.success;
  } catch { return false; }
}

export async function forceAcquireAdminLock(clientName?: string): Promise<boolean> {
  const url = getServerUrl();
  if (!url) return true;
  const id = getClientId();
  const name = clientName || getClientName(id);
  try {
    const res = await fetch(`${url}/api/admin-lock/force`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: id, clientName: name }) });
    const data = await res.json();
    return data.success;
  } catch { return false; }
}

export async function releaseAdminLock(): Promise<void> {
  const url = getServerUrl();
  if (!url) return;
  try { await fetch(`${url}/api/admin-lock/release`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: getClientId() }) }); } catch {}
}

export async function refreshAdminLock(): Promise<void> {
  const url = getServerUrl();
  if (!url) return;
  try { await fetch(`${url}/api/admin-lock/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: getClientId() }) }); } catch {}
}

export async function getAdminLockInfo(): Promise<{ locked: boolean; holderId?: string; holderName?: string; expiresAt?: number; serverReachable?: boolean }> {
  const url = getServerUrl();
  if (!url) return { locked: false, serverReachable: true };
  try {
    const res = await fetch(`${url}/api/admin-lock/status`);
    const data = await res.json();
    return data.locked ? { locked: true, holderId: data.lock?.clientId, holderName: data.lock?.clientName, expiresAt: data.expiresAt, serverReachable: true } : { locked: false, serverReachable: true };
  } catch { return { locked: false, serverReachable: false }; }
}

export async function isAdminLocked(): Promise<boolean> {
  const info = await getAdminLockInfo();
  return info.locked;
}

export function notifyServerOfLockAction(action: 'acquire' | 'release' | 'force', clientId: string, clientName?: string): void {
  const url = getServerUrl();
  if (!url) return;
  fetch(`${url}/api/admin-lock/lock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, clientId, clientName }) }).catch(() => {});
}
