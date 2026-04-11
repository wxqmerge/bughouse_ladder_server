/**
 * Detects the current program mode
 * @returns 'a' = local mode, 'd' = dev mode, 's' = client/server mode
 */
export function getProgramMode(): string {
  // Check if running in development mode
  if (import.meta.env.DEV || import.meta.env.VITE_APP_MODE === 'development') {
    return 'd'; // Dev mode
  }
  
  // Check if configured for client/server mode
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl && apiUrl.startsWith('http')) {
    return 's'; // Client/server mode
  }
  
  // Default to local mode
  return 'a'; // Local mode
}

/**
 * Gets the version string with mode indicator
 * @returns Version string like "v1.0.0d" for dev mode
 */
export function getVersionString(): string {
  const version = import.meta.env.PACKAGE_VERSION || '1.0.0';
  const mode = getProgramMode();
  return `v${version}${mode}`;
}
