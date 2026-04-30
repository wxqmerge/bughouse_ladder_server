/**
 * Debug utility for conditional logging based on settings
 */

import { getSettings } from '../services/storageService';

export function getDebugLevel(): number {
  try {
    const settings = getSettings();
    if (settings) {
      return settings.debugLevel ?? 5;
    }
  } catch (err) {
    // Ignore errors, use default
  }
  return 5;
}

export function shouldLog(debugThreshold: number): boolean {
  // Higher threshold = shows in more situations (more verbose)
  // debugLevel 0 = most verbose (all logs), debugLevel 10+ = least verbose
  return getDebugLevel() <= debugThreshold;
}

export function debugLog(
  message: string,
  threshold: number = 10,
  ...args: any[]
): void {
  if (shouldLog(threshold)) {
    console.log(message, ...args);
  }
}
