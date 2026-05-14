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

let lastSavedServer: string = '';
let lastSavedApiKey: string = '';

function shouldSaveLastWorkingConfig(server: string, apiKey: string): boolean {
  return server !== lastSavedServer || apiKey !== lastSavedApiKey;
}

function markLastWorkingConfigSaved(server: string, apiKey: string): void {
  lastSavedServer = server;
  lastSavedApiKey = apiKey;
}

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
 export async function initializeConnectionState(): Promise<void> {
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
       lastSavedServer = '';
       lastSavedApiKey = '';
       return;
     }
   } catch (err) {
     console.error('[mode.ts] Failed to read user settings:', err);
   }
   
  // No server configured - try same-origin auto-detection
   let autoDetectedUrl: string | null = null;
   try {
     const origin = window.location.origin;
     console.log('[mode.ts] Auto-detect: origin=', origin);
     
     // Step 1: Check same-origin first
     const healthController = new AbortController();
     const healthTimeoutId = setTimeout(() => healthController.abort(), 3000);
     
     const healthResponse = await fetch(`${origin}/health`, {
       method: 'GET',
       signal: healthController.signal,
     });
     clearTimeout(healthTimeoutId);
     console.log('[mode.ts] Auto-detect: /health status=', healthResponse.status, 'ok=', healthResponse.ok);
     
     const healthOk = healthResponse.ok || healthResponse.status === 404;
     
     const apiController = new AbortController();
     const apiTimeoutId = setTimeout(() => apiController.abort(), 3000);
     
     const apiResponse = await fetch(`${origin}/api/ladder`, {
       method: 'GET',
       signal: apiController.signal,
     });
     clearTimeout(apiTimeoutId);
     console.log('[mode.ts] Auto-detect: /api/ladder status=', apiResponse.status, 'ok=', apiResponse.ok);
     
     const apiOk = apiResponse.ok || apiResponse.status === 401 || apiResponse.status === 403 || apiResponse.status === 404;
     
     if (healthOk && apiOk) {
       autoDetectedUrl = origin.replace(/\/$/, '');
       console.log('[mode.ts] Same-origin auto-detected:', autoDetectedUrl);
     } else {
       console.log('[mode.ts] Same-origin detection FAILED: healthOk=', healthOk, 'apiOk=', apiOk);
     }
   } catch (e) {
     console.log('[mode.ts] Same-origin detection threw error:', (e as Error).message);
   }
   
   // Step 2: If same-origin failed, try subdomain-based detection
   if (!autoDetectedUrl) {
     try {
       const pathname = window.location.pathname;
       const hostname = window.location.hostname;
       
       // Extract project name from path (e.g., /dev-ladder/dist/ → dev-ladder)
       const match = pathname.match(/^\/([^/]+)\/dist(?:\/.*)?$/);
       if (match) {
         const projectName = match[1];
         const candidateUrl = `https://${projectName}.${hostname}`;
         console.log('[mode.ts] Subdomain candidate from path:', projectName, '→', candidateUrl);
         
         // Validate candidate
         const healthController = new AbortController();
         const healthTimeoutId = setTimeout(() => healthController.abort(), 3000);
         
         let healthOk = false;
         try {
           const healthResponse = await fetch(`${candidateUrl}/health`, {
             method: 'GET',
             signal: healthController.signal,
           });
           clearTimeout(healthTimeoutId);
           console.log('[mode.ts] Subdomain check: /health status=', healthResponse.status);
           healthOk = healthResponse.ok || healthResponse.status === 404;
         } catch {
           clearTimeout(healthTimeoutId);
         }
         
         if (healthOk) {
           const apiController = new AbortController();
           const apiTimeoutId = setTimeout(() => apiController.abort(), 3000);
           
           let apiOk = false;
           let apiStatus = 0;
           try {
             const apiResponse = await fetch(`${candidateUrl}/api/ladder`, {
               method: 'GET',
               signal: apiController.signal,
             });
             clearTimeout(apiTimeoutId);
             apiStatus = apiResponse.status;
             console.log('[mode.ts] Subdomain check: /api/ladder status=', apiStatus);
             apiOk = apiResponse.ok || apiResponse.status === 401 || apiResponse.status === 403 || apiResponse.status === 404;
           } catch (e) {
             clearTimeout(apiTimeoutId);
             console.log('[mode.ts] Subdomain check: /api/ladder error:', (e as Error).message);
           }
           
           if (apiOk) {
             autoDetectedUrl = candidateUrl;
             console.log('[mode.ts] Subdomain auto-detected:', autoDetectedUrl);
           } else {
             console.log('[mode.ts] Subdomain detection FAILED: apiOk=', apiOk, 'apiStatus=', apiStatus);
           }
         } else {
           console.log('[mode.ts] Subdomain /health check failed');
         }
       } else {
         console.log('[mode.ts] No project name found in path:', pathname, '(expected /{project-name}/dist/)');
       }
     } catch (e) {
       console.log('[mode.ts] Subdomain detection threw error:', (e as Error).message);
     }
   }
   
   // Step 3: Use auto-detected URL if found
   if (autoDetectedUrl) {
     connectionState.configuredForServer = true;
     connectionState.serverUrl = autoDetectedUrl;
     connectionState.serverReachable = true;
     connectionState.lastCheckTime = Date.now();
     connectionState.previousMode = null;
     lastSavedServer = '';
     lastSavedApiKey = '';
     return;
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
  
  // Step 1: Check /health endpoint
  const healthController = new AbortController();
  const healthTimeoutId = setTimeout(() => healthController.abort(), 3000);
  
  let healthOk = false;
  let healthStatus = 0;
  try {
    const healthResponse = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      signal: healthController.signal,
    });
    clearTimeout(healthTimeoutId);
    healthStatus = healthResponse.status;
    healthOk = healthResponse.ok || healthResponse.status === 404;
    console.log('[mode.ts] testServerConnection: /health status=', healthStatus);
  } catch (e) {
    clearTimeout(healthTimeoutId);
    console.log('[mode.ts] testServerConnection: /health error:', (e as Error).message);
    return false;
  }
  
  if (!healthOk) {
    console.log('[mode.ts] testServerConnection: /health not ok (status', healthStatus, ')');
    return false;
  }
  
  // Step 2: Verify API routes are actually accessible
  const apiController = new AbortController();
  const apiTimeoutId = setTimeout(() => apiController.abort(), 3000);
  
  let apiOk = false;
  let apiStatus = 0;
  try {
    const apiResponse = await fetch(`${apiUrl}/api/ladder`, {
      method: 'GET',
      signal: apiController.signal,
    });
    clearTimeout(apiTimeoutId);
    apiStatus = apiResponse.status;
    // /api/ladder GET is public - should return 200 with data
    // 404 means Express routes aren't registered
    // 401/403 means auth is required (still a valid server)
    apiOk = apiResponse.ok || apiResponse.status === 401 || apiResponse.status === 403 || apiResponse.status === 404;
    console.log('[mode.ts] testServerConnection: /api/ladder status=', apiStatus);
  } catch (e) {
    clearTimeout(apiTimeoutId);
    console.log('[mode.ts] testServerConnection: /api/ladder error:', (e as Error).message);
    return false;
  }
  
  if (!apiOk) {
    console.log('[mode.ts] testServerConnection: /api/ladder not ok (status', apiStatus, ')');
    return false;
  }
  
  const settings = loadUserSettings();
  if (shouldSaveLastWorkingConfig(apiUrl, settings.apiKey)) {
    saveLastWorkingConfig(apiUrl, settings.apiKey);
    markLastWorkingConfigSaved(apiUrl, settings.apiKey);
  }
  return true;
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



