/**
 * Debug utility for conditional logging based on settings
 */

import { getSettings } from '../services/storageService';

export function getDebugLevel(): number {
  const settings = getSettings();
  return settings.debugLevel ?? 5;
}

export function shouldLog(debugThreshold: number): boolean {
  return getDebugLevel() <= debugThreshold;
}

/**
 * Log a user click action. Only fires when debugLevel <= 5.
 * Usage: debugClick('Settings')  -> console: [CLICK]->Settings
 */
export function debugClick(label: string): void {
  if (shouldLog(5)) {
    console.debug(`[CLICK]->${label}`);
  }
}

/**
 * Log a user text input. Only fires when debugLevel <= 5.
 * Usage: debugInput('Server URL', 'http://localhost:3000')  -> console: [INPUT]->Server URL = "http://localhost:3000"
 */
export function debugInput(label: string, value: string): void {
  if (shouldLog(5)) {
    console.debug(`[INPUT]->${label} = "${value}"`);
  }
}
