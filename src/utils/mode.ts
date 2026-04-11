// Connection state tracking
let connectionState: {
  configuredForServer: boolean;
  serverReachable: boolean | null; // null = not yet tested
  lastCheckTime: number;
} = {
  configuredForServer: false,
  serverReachable: null,
  lastCheckTime: 0,
};

/**
 * Initialize connection state based on configuration
 */
export function initializeConnectionState(): void {
  const apiUrl = import.meta.env.VITE_API_URL;
  connectionState.configuredForServer = !!(apiUrl && apiUrl.startsWith('http'));
  connectionState.serverReachable = null; // Reset reachability
  connectionState.lastCheckTime = Date.now();
}

/**
 * Test if the server is reachable
 */
export async function testServerConnection(): Promise<boolean> {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl || !apiUrl.startsWith('http')) {
    return false;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  
  try {
    // Try a lightweight request to test connectivity
    const response = await fetch(`${apiUrl}/health`, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    clearTimeout(timeoutId);
    // If /health doesn't exist, try the main endpoint
    try {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 3000);
      const response = await fetch(apiUrl, {
        method: 'HEAD',
        signal: controller2.signal,
      });
      clearTimeout(timeoutId2);
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
  
  const isReachable = await testServerConnection();
  connectionState.serverReachable = isReachable;
  connectionState.lastCheckTime = Date.now();
}

/**
 * Detects the current program mode based on ACTUAL behavior
 * @returns 'a' = local mode, 'd' = dev mode, 's' = client/server mode
 */
export function getProgramMode(): string {
  // If configured for server but it's unreachable, we're effectively in local mode
  if (connectionState.configuredForServer) {
    if (connectionState.serverReachable === false) {
      return 'a'; // Server unreachable = local mode with fallback
    }
    // Server is reachable or not yet tested - report server mode
    const apiUrl = import.meta.env.VITE_API_URL || '';
    if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
      return 'd'; // Development (local server)
    }
    return 's'; // Production server
  }
  
  // No server configured = local mode (standalone with localStorage)
  return 'a'; // Local mode
}

// Initialize on module load
initializeConnectionState();

/**
 * Gets the version string with mode indicator
 * @returns Version string like "v1.0.0-local" or "v1.0.0-server"
 */
export function getVersionString(): string {
  const version = import.meta.env.PACKAGE_VERSION || '1.0.0';
  const mode = getProgramMode();
  const modeName = mode === 'a' ? 'local' : 'server';
  return `v${version}-${modeName}`;
}
