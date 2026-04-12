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
      };
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
    localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
    console.log('[UserSettings] Saved settings:', { server: settings.server || '(empty)', apiKey: settings.apiKey ? '(set)' : '(empty)' });
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
