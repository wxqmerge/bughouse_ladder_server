/**
 * Debug utilities with timestamps
 */

import { getTimestamp } from '../../shared/utils/timeUtils';

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
