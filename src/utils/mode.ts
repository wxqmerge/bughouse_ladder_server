import { loadUserSettings, saveLastWorkingConfig } from '../services/userSettingsStorage';

// Connection state tracking
let connectionState: {
  configuredForServer: boolean;
  serverUrl: string | null; // Current server URL (for display)
  serverReachable: boolean | null; // null = not yet tested
  lastCheckTime: number;
  previousMode: string | null; // Track mode changes
} = {
  configuredForServer: false,
  serverUrl: null,
  serverReachable: null,
  lastCheckTime: 0,
  previousMode: null,
};

// Callback for mode changes
let onModeChangeCallback: ((newMode: string, oldMode: string) => void) | null = null;

// Retry interval ID
let retryIntervalId: number | null = null;

/**
 * Set callback for mode changes
 */
export function onModeChange(callback: (newMode: string, oldMode: string) => void): void {
  onModeChangeCallback = callback;
}

/**
 * Initialize connection state based on configuration
 * Reads ONLY from localStorage user settings - no env fallback
 */
export function initializeConnectionState(): void {
  // Read from localStorage user settings only
  try {
    const userSettings = loadUserSettings();
    if (userSettings.server && userSettings.server.trim()) {
      connectionState.configuredForServer = true;
      connectionState.serverUrl = userSettings.server.trim();
      console.log('[mode.ts] Using USER SETTINGS server:', connectionState.serverUrl);
      connectionState.serverReachable = null;
      connectionState.lastCheckTime = Date.now();
      connectionState.previousMode = null;
      return;
    }
  } catch (err) {
    console.error('[mode.ts] Failed to read user settings:', err);
  }
  
  // No server configured - local mode
  connectionState.configuredForServer = false;
  connectionState.serverUrl = null;
  connectionState.serverReachable = null;
  connectionState.lastCheckTime = Date.now();
  connectionState.previousMode = null;
}

/**
 * Test if the server is reachable
 */
export async function testServerConnection(): Promise<boolean> {
  // Use server URL from connection state (set from user settings or env)
  const apiUrl = connectionState.serverUrl;
  if (!apiUrl || !apiUrl.startsWith('http')) {
    return false;
  }

  // Report status for long-running operations
  (window as any).__ladder_setStatus?.(`Connecting to ${new URL(apiUrl).hostname}...`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  
  try {
    // Use GET instead of HEAD - Express doesn't handle HEAD on custom routes
    const response = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      const settings = loadUserSettings();
      saveLastWorkingConfig(apiUrl, settings.apiKey);
    }
    return response.ok;
  } catch (error) {
    clearTimeout(timeoutId);
    // If /health doesn't exist, try the main endpoint
    try {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 3000);
      const response = await fetch(apiUrl, {
        method: 'GET',
        signal: controller2.signal,
      });
      clearTimeout(timeoutId2);
      if (response.ok || response.status === 404) {
        const settings = loadUserSettings();
        saveLastWorkingConfig(apiUrl, settings.apiKey);
      }
      return response.ok || response.status === 404; // 404 means server is up
    } catch {
      return false;
    }
  }
}

/**
 * Update connection state based on actual connectivity
 */
export async function updateConnectionState(): Promise<void> {
  if (!connectionState.configuredForServer) {
    return; // Nothing to check
  }
  
  const oldMode = getProgramMode();
  const isReachable = await testServerConnection();
  connectionState.serverReachable = isReachable;
  connectionState.lastCheckTime = Date.now();
  
  const newMode = getProgramMode();
  
  // Notify callback if mode changed
  if (oldMode !== newMode && onModeChangeCallback) {
    connectionState.previousMode = oldMode;
    onModeChangeCallback(newMode, oldMode);
  }
}

/**
 * Start periodic server reachability checks (every 10 seconds)
 * Automatically switches to local mode if server becomes unreachable
 */
export function startPeriodicChecks(): void {
  // Clear existing interval if any
  if (retryIntervalId !== null) {
    window.clearInterval(retryIntervalId);
    retryIntervalId = null;
  }
  
  // Check every 10 seconds
  retryIntervalId = window.setInterval(async () => {
    await updateConnectionState();
  }, 10000); // 10 seconds
}

/**
 * Stop periodic server reachability checks
 */
export function stopPeriodicChecks(): void {
  if (retryIntervalId !== null) {
    window.clearInterval(retryIntervalId);
    retryIntervalId = null;
  }
}

/**
 * Program mode enum for type safety
 * 'local' = no server configured, standalone operation
 * 'server_down' = server configured but unreachable
 * 'server' = server configured and reachable (production or localhost)
 */
export type ProgramMode = 'local' | 'server_down' | 'server';

/**
 * Detects the current program mode based on ACTUAL behavior
 * @returns mode string
 */
export function getProgramMode(): ProgramMode {
  // If configured for server but it's unreachable, we're in server down mode
  if (connectionState.configuredForServer) {
    if (connectionState.serverReachable === false) {
      return 'server_down'; // Server unreachable = limited functionality
    }
    return 'server'; // Server configured and reachable
  }
  
  // No server configured = local mode (standalone with localStorage)
  return 'local'; // Local mode
}



/**
 * Gets the version string with mode indicator
 * @returns Version string like "v1.0.2-local" or "v1.0.2-server"
 */
export function getVersionString(): string {
  const version = import.meta.env.PACKAGE_VERSION;
  const mode = getProgramMode();
  const modeName = mode === 'local' ? 'local' : mode === 'server_down' ? 'server-down' : 'server';
  return `v${version}-${modeName}`;
}

/**
 * Check if currently in local mode (no server configured)
 */
export function isLocalMode(): boolean {
  return getProgramMode() === 'local';
}

/**
 * Check if currently in server down mode (server configured but unreachable)
 */
export function isServerDownMode(): boolean {
  return getProgramMode() === 'server_down';
}



