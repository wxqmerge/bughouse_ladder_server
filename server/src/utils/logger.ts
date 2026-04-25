import { getTimestamp } from './timestamp.js';

export function log(category: string, message: string, ...args: any[]): void {
  console.log(`[${getTimestamp()}] ${category}`, message, ...args);
}

export function logError(category: string, message: string, ...args: any[]): void {
  console.error(`[${getTimestamp()}] ${category}`, message, ...args);
}

export function logWarn(category: string, message: string, ...args: any[]): void {
  console.warn(`[${getTimestamp()}] ${category}`, message, ...args);
}
