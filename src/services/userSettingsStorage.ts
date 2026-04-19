/**
 * User Settings Storage
 * 
 * Stores per-user configuration in localStorage that persists across sessions:
 * - Server URL (e.g., "omen.com:3000") - empty = local mode
 * - API Key for authentication
 */

const USER_SETTINGS_KEY = 'bughouse-ladder-user-settings';

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
    const stored = localStorage.getItem(USER_SETTINGS_KEY);
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
    localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify({ ...settings, server: normalizedServer }));
    console.log('[UserSettings] Saved settings:', { server: normalizedServer || '(empty)', apiKey: settings.apiKey ? '(set)' : '(empty)', debugMode: settings.debugMode });
  } catch (error) {
    console.error('[UserSettings] Failed to save settings:', error);
  }
};

/**
 * Clear user settings from localStorage
 */
export const clearUserSettings = (): void => {
  localStorage.removeItem(USER_SETTINGS_KEY);
  console.log('[UserSettings] Cleared user settings');
};
