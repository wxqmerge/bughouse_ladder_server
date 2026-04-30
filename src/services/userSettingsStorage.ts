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

function getUserSettingsKey(): string {
  return getLadderPrefix() + 'ladder_user_settings';
}

export interface UserSettings {
  server: string;    // e.g., "omen.com:3000" or "http://localhost:3000" - empty = local mode
  apiKey: string;    // API key for authentication (optional)
  debugMode: boolean; // Show extra debug info in dialogs (default: false)
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
      return {
        server: parsed.server || '',
        apiKey: parsed.apiKey || '',
        debugMode: parsed.debugMode || false,
      };
    }
  } catch (error) {
    console.error('[UserSettings] Failed to load settings:', error);
  }
  return { server: '', apiKey: '', debugMode: false };
};

/**
 * Save user settings to localStorage
 */
export const saveUserSettings = (settings: UserSettings): void => {
  try {
    const normalizedServer = normalizeServerUrl(settings.server);
    localStorage.setItem(getUserSettingsKey(), JSON.stringify({ ...settings, server: normalizedServer }));
    console.log('[UserSettings] Saved settings:', { server: normalizedServer || '(empty)', apiKey: settings.apiKey ? '(set)' : '(empty)', debugMode: settings.debugMode });
  } catch (error) {
    console.error('[UserSettings] Failed to save settings:', error);
  }
};

/**
 * Clear user settings from localStorage
 */
const clearUserSettings = (): void => {
  localStorage.removeItem(getUserSettingsKey());
  console.log('[UserSettings] Cleared user settings');
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
    console.log('[UserSettings] Saved last working config:', { server: normalizedServer, hasKey: !!apiKey });
  } catch (error) {
    console.error('[UserSettings] Failed to save last working config:', error);
  }
}

export function getLastWorkingConfig(): LastWorkingConfig | null {
  try {
    const stored = localStorage.getItem(getLastWorkingConfigKey());
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('[UserSettings] Failed to load last working config:', error);
  }
  return null;
}

function clearLastWorkingConfig(): void {
  localStorage.removeItem(getLastWorkingConfigKey());
  console.log('[UserSettings] Cleared last working config');
}

/**
 * Load remote .tab or .xls file from URL (both are tab-separated format)
 * Stores content in sessionStorage for the splash screen to pick up
 */
export async function loadRemoteFile(fileUrl: string): Promise<{ success: boolean; filename?: string }> {
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const text = await response.text();
    const blob = new Blob([text], { type: 'text/tab-separated-values' });
    const fileName = fileUrl.split('/').pop()?.split('?')[0] || 'ladder';
    
    sessionStorage.setItem('pendingFileContent', btoa(unescape(encodeURIComponent(text))));
    sessionStorage.setItem('pendingFileName', fileName);
    sessionStorage.setItem('pendingFileLoad', 'true');
    
    console.log('[UserSettings] Remote file loaded:', fileName);
    return { success: true, filename: fileName };
  } catch (error) {
    console.error('[UserSettings] Failed to load remote file:', error);
    return { success: false };
  }
}

/**
 * Load config from URL query params:
 *   ?config=1&server=http://host:port&key=abc123  → server connection
 *   ?config=3&file=http://host/file.tab            → remote file load (.tab or .xls)
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
      debugMode: false,
    });

    console.log('[Config] Server config loaded from URL:', { server: normalized, hasKey: !!apiKey });
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
  
  else {
    alert(`Unknown config type: ${configType}\n\nUse:\n- ?config=1&server=http://host:port&key=yourkey (server)\n- ?config=3&file=http://host/file.tab (remote file)\n- ?config=2 (reset to local)`);
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
