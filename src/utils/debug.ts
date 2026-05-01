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
