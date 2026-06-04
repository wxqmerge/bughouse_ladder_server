/**
 * User Settings Storage
 * 
 * Stores per-user configuration in localStorage that persists across sessions:
 * - Server URL (e.g., "omen.com:3000") - empty = local mode
 * - API Key for authentication
 * 
 * Keys are per-ladder (derived from window.location) so different ladders are fully independent.
 * 
 * NOTE: This module does NOT import getKeyPrefix to avoid circular dependency with storageService.
 * The key derivation logic is duplicated here intentionally.
 */

import { gatedFetch } from '../utils/requestGate';

function getLadderPrefix(): string {
  // Same logic as derivePrefixFromLocation in storageService.ts
  // Duplicated to avoid circular dependency
  const host = window.location.hostname.replace(/[.\-:]/g, '_');
  const path = window.location.pathname
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const combined = host + (path ? '_' + path : '');
  return 'ladder_' + combined + '_';
}

export function getUserSettingsKey(): string {
  return getLadderPrefix() + 'ladder_user_settings';
}

export interface UserSettings {
  server: string;    // e.g., "omen.com:3000" or "http://localhost:3000" - empty = local mode
  apiKey: string;    // API key for authentication (optional)
}

export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!url) return '';
  // Replace backslashes with forward slashes (Windows-style paths)
  url = url.replace(/\\/g, '/');
  // Ensure protocol is present
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  return url;
}

/**
 * Load user settings from localStorage
 */
export const loadUserSettings = (): UserSettings => {
  try {
    const stored = localStorage.getItem(getUserSettingsKey());
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        return {
          server: parsed.server || '',
          apiKey: parsed.apiKey || '',
        };
      }
      return { server: '', apiKey: '' };
    }
  } catch (error) {
    console.error('[UserSettings] Failed to load settings:', error);
  }
  return { server: '', apiKey: '' };
};

/**
 * Save user settings to localStorage
 */
export const saveUserSettings = (settings: UserSettings): void => {
  try {
    const normalizedServer = normalizeServerUrl(settings.server);
    localStorage.setItem(getUserSettingsKey(), JSON.stringify({ ...settings, server: normalizedServer }));
    console.debug('[UserSettings] Saved settings:', { server: normalizedServer || '(empty)', apiKey: settings.apiKey ? '(set)' : '(empty)' });
  } catch (error) {
    console.error('[UserSettings] Failed to save settings:', error);
  }
};

/**
 * Clear user settings from localStorage
 */
const clearUserSettings = (): void => {
  localStorage.removeItem(getUserSettingsKey());
  console.debug('[UserSettings] Cleared user settings');
};

function getLastWorkingConfigKey(): string {
  return getLadderPrefix() + 'ladder_last_working_config';
}

export interface LastWorkingConfig {
  server: string;
  apiKey: string;
}

export function saveLastWorkingConfig(server: string, apiKey: string): void {
  try {
    const normalizedServer = normalizeServerUrl(server);
    localStorage.setItem(getLastWorkingConfigKey(), JSON.stringify({ server: normalizedServer, apiKey }));
    // console.log('[UserSettings] Saved last working config:', { server: normalizedServer, hasKey: !!apiKey });
  } catch (error) {
    console.error('[UserSettings] Failed to save last working config:', error);
  }
}

export function getLastWorkingConfig(): LastWorkingConfig | null {
  try {
    const stored = localStorage.getItem(getLastWorkingConfigKey());
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && typeof parsed.server === 'string' && typeof parsed.apiKey === 'string') {
        return { server: parsed.server, apiKey: parsed.apiKey };
      }
      console.warn('[UserSettings] Corrupted last working config in localStorage, ignoring');
      return null;
    }
  } catch (error) {
    console.error('[UserSettings] Failed to load last working config:', error);
  }
  return null;
}

function clearLastWorkingConfig(): void {
  localStorage.removeItem(getLastWorkingConfigKey());
  console.debug('[UserSettings] Cleared last working config');
}

/**
 * Load remote .tab or .xls file from URL (both are tab-separated format)
 * Stores content in sessionStorage for the splash screen to pick up
 */
export async function loadRemoteFile(fileUrl: string): Promise<{ success: boolean; filename?: string }> {
  try {
    const response = await gatedFetch(fileUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const text = await response.text();

    // Guard: reject trophy report files
    const firstLine = text.split('\n')[0]?.trim() || '';
    const trophyIndicators = ['DEBUG', 'TROPHY REPORT', 'Trophy Report', 'AWARDED TROPHIES', 'MINI-GAME PLAYERS'];
    if (trophyIndicators.some(ind => firstLine.startsWith(ind))) {
      alert('This is a trophy report file, not a ladder file. Trophy reports cannot be loaded as player data.');
      return { success: false };
    }
    if (!firstLine.startsWith('Group')) {
      if (!window.confirm('This file does not start with "Group" in the header row. It may not be a valid ladder file. Load it anyway?')) {
        return { success: false };
      }
    }

    const fileName = fileUrl.split('/').pop()?.split('?')[0] || 'ladder';
    
    sessionStorage.setItem('pendingFileContent', btoa(unescape(encodeURIComponent(text))));
    sessionStorage.setItem('pendingFileName', fileName);
    sessionStorage.setItem('pendingFileLoad', 'true');
    
    console.debug('[UserSettings] Remote file loaded:', fileName);
    return { success: true, filename: fileName };
  } catch (error) {
    console.error('[UserSettings] Failed to load remote file:', error);
    return { success: false };
  }
}

/**
 * Load config from URL query params:
 *   ?config=1&server=http://host:port&key=abc123  → server connection
 *   ?config=2                                     → reset to local mode
 *   ?config=3&file=http://host/file.tab            → remote file load (.tab or .xls)
 *   ?config=4                                     → clear all game results, keep players
 */
export async function loadConfigFromUrl(): Promise<boolean> {
  const url = new URL(window.location.href);
  if (!url.searchParams.get('config')) return false;

  const configType = url.searchParams.get('config');
  
  // Server connection: ?config=1&server=...&key=...
  if (configType === '1') {
    const serverUrl = url.searchParams.get('server') || '';
    const apiKey = url.searchParams.get('key') || '';
    
    if (!serverUrl.trim()) {
      alert('Missing server URL. Use: ?config=1&server=http://host:port&key=yourkey');
      return false;
    }

    const normalized = normalizeServerUrl(serverUrl);
    
    saveUserSettings({
      server: normalized,
      apiKey: apiKey.trim(),
    });

    console.debug('[Config] Server config loaded from URL:', { server: normalized, hasKey: !!apiKey });
  }
  
  // Remote file load: ?config=3&file=http://host/file.tab
  else if (configType === '3') {
    const fileUrl = url.searchParams.get('file');
    
    if (!fileUrl) {
      alert('Missing file URL. Use: ?config=3&file=http://host/file.tab');
      
      return false;
    }

    const result = await loadRemoteFile(fileUrl);
    if (result.success) {
      alert(`Loaded file: ${result.filename}\n\nThe app will reload to apply.`);
      setTimeout(() => window.location.reload(), 1000);
    } else {
      alert('Failed to load file from URL. Check the URL and try again.');
    }
  }
  
  // Local mode reset: ?config=2 (no parameters)
  else if (configType === '2') {
    clearUserSettings();
    clearLastWorkingConfig();
    sessionStorage.removeItem('pendingFileLoad');
    sessionStorage.removeItem('pendingFileContent');
    sessionStorage.removeItem('pendingFileName');
    alert('Reset to local mode.\n\nThe app will reload to apply.');
    setTimeout(() => window.location.reload(), 500);
  }

  // Clear all game results, keep players: ?config=4
  else if (configType === '4') {
    if (!window.confirm('This will clear ALL game results for every player.\nPlayer names and ratings will be kept.\n\nContinue?')) {
      return false;
    }

    const settings = loadUserSettings();
    const prefix = getLadderPrefix();

    if (settings.server) {
      // SERVER mode: call admin API
      const serverUrl = normalizeServerUrl(settings.server);
      gatedFetch(`${serverUrl}/api/admin/clear-results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey ? { 'x-api-key': settings.apiKey } : {}),
        },
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (data.success) {
            alert(`Cleared results for ${data.data.cleared} players.\n\nThe app will reload to apply.`);
            setTimeout(() => window.location.reload(), 500);
          } else {
            alert('Failed to clear results: ' + (data.error?.message || 'Unknown error'));
          }
        })
        .catch((err) => {
          console.error('[Config] Failed to clear results:', err);
          alert('Failed to clear results. Check your connection and try again.');
        });
    } else {
      // LOCAL mode: clear gameResults from localStorage
      const playersKey = prefix + 'ladder_players';
      const stored = localStorage.getItem(playersKey);
      if (stored) {
        try {
          const players = JSON.parse(stored);
          let cleared = 0;
          if (Array.isArray(players)) {
            for (const player of players) {
              if (player && Array.isArray(player.gameResults)) {
                player.gameResults = new Array(31).fill(null);
                cleared++;
              }
            }
            localStorage.setItem(playersKey, JSON.stringify(players));
          }
          alert(`Cleared results for ${cleared} players.\n\nThe app will reload to apply.`);
          setTimeout(() => window.location.reload(), 500);
        } catch (err) {
          console.error('[Config] Failed to parse players:', err);
          alert('Failed to clear results. Corrupted player data.');
        }
      } else {
        alert('No player data found in localStorage.');
        return false;
      }
    }
  }
  
  else {
    console.warn(`[USER_SETTINGS] Unknown config type: ${configType}. Use ?config=1 (server), ?config=2 (local), ?config=3 (file), or ?config=4 (clear results).`);
    return false;
  }

  // Clear the query params from URL (so reload doesn't re-apply)
  url.searchParams.delete('config');
  url.searchParams.delete('server');
  url.searchParams.delete('key');
  url.searchParams.delete('file');
  window.history.replaceState({}, '', url.toString());

  return true;
}
