/**
 * Debug utilities with timestamps
 */

/**
 * Get formatted current timestamp
 * Format: YYYY-MM-DD HH:MM:SS.mmm
 */
export function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Console log with timestamp prefix
 * @param category - Category label (e.g., '[SERVER]', '[CLIENT]', '[RECALC]')
 * @param message - Message to log
 * @param args - Additional arguments to log
 */
export function log(category: string, message: string, ...args: any[]): void {
  const timestamp = getTimestamp();
  console.log(`[${timestamp}] ${category}`, message, ...args);
}

/**
 * Console error with timestamp prefix
 */
export function logError(category: string, message: string, ...args: any[]): void {
  const timestamp = getTimestamp();
  console.error(`[${timestamp}] ${category}`, message, ...args);
}

/**
 * Console warn with timestamp prefix
 */
export function logWarn(category: string, message: string, ...args: any[]): void {
  const timestamp = getTimestamp();
  console.warn(`[${timestamp}] ${category}`, message, ...args);
}
