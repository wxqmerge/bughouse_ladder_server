// Performance monitoring utilities
// Tracks operations that exceed the specified threshold (default: 500ms)

import { getTimestamp } from './timestamp.js';

const SLOW_THRESHOLD_MS = 100;

interface SlowOperation {
  label: string;
  duration: number;
  timestamp: string;
  stack?: string;
}

const slowOperations: SlowOperation[] = [];

// Maximum number of slow operations to keep in memory
const MAX_HISTORY = 100;

function logSlowOperation(label: string, duration: number, includeStack: boolean = true): void {
  const stack = includeStack ? new Error().stack?.split('\n').slice(2, 6).join('\n    ') : undefined;
  
  slowOperations.push({
    label,
    duration,
    timestamp: getTimestamp(),
    stack,
  });

  // Keep only recent history
  if (slowOperations.length > MAX_HISTORY) {
    slowOperations.shift();
  }

  console.log(`\n[SLOW] ${label} took ${duration}ms`);
  if (stack) {
    console.log(`[STACK]\n    ${stack}`);
  }
}

// Enhanced timing wrapper with context tracking
export async function withTiming<T>(
  label: string, 
  fn: () => T | Promise<T>,
  options: { threshold?: number; logStack?: boolean } = {}
): Promise<T> {
  const { threshold = SLOW_THRESHOLD_MS, logStack = true } = options;
  const startTime = Date.now();
  
  try {
    const result = await fn();
    const duration = Date.now() - startTime;
    
    if (duration > threshold) {
      logSlowOperation(label, duration, logStack);
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (duration > threshold) {
      console.log(`\n[SLOW-ERROR] ${label} threw after ${duration}ms`);
      console.log(`[ERROR]`, error);
      const stack = new Error().stack?.split('\n').slice(2, 6).join('\n    ');
      if (stack) {
        console.log(`[STACK]\n    ${stack}`);
      }
    }
    
    throw error;
  }
}


