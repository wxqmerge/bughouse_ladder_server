// Performance monitoring utilities
// Tracks operations that exceed the specified threshold (default: 500ms)

const SLOW_THRESHOLD_MS = 500;

interface SlowOperation {
  label: string;
  duration: number;
  timestamp: string;
  stack?: string;
}

const slowOperations: SlowOperation[] = [];

// Maximum number of slow operations to keep in memory
const MAX_HISTORY = 100;

function getTimestamp(): string {
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

export function logSlowOperation(label: string, duration: number, includeStack: boolean = true): void {
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

export function getSlowOperations(): SlowOperation[] {
  return [...slowOperations];
}

export function clearSlowOperations(): void {
  slowOperations.length = 0;
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

// Track promise chains for async operations
export function trackPromise<T>(
  promise: Promise<T>, 
  label: string,
  options: { threshold?: number } = {}
): Promise<T> {
  const { threshold = SLOW_THRESHOLD_MS } = options;
  const startTime = Date.now();
  
  return promise.then(
    (result) => {
      const duration = Date.now() - startTime;
      if (duration > threshold) {
        logSlowOperation(label, duration);
      }
      return result;
    },
    (error) => {
      const duration = Date.now() - startTime;
      if (duration > threshold) {
        console.log(`\n[SLOW-ERROR] ${label} threw after ${duration}ms`);
        console.log(`[ERROR]`, error);
      }
      throw error;
    }
  );
}

// Performance report generator
export function generatePerformanceReport(): string {
  const operations = getSlowOperations();
  
  if (operations.length === 0) {
    return 'No slow operations recorded.';
  }

  let report = '\n========================================\n';
  report += '  PERFORMANCE REPORT\n';
  report += '========================================\n\n';
  report += `Total slow operations (>${SLOW_THRESHOLD_MS}ms): ${operations.length}\n\n`;

  // Group by label
  const grouped = new Map<string, { count: number; total: number; max: number }>();
  for (const op of operations) {
    if (!grouped.has(op.label)) {
      grouped.set(op.label, { count: 0, total: 0, max: 0 });
    }
    const stats = grouped.get(op.label)!;
    stats.count++;
    stats.total += op.duration;
    stats.max = Math.max(stats.max, op.duration);
  }

  // Sort by total time
  const sorted = Array.from(grouped.entries())
    .sort((a, b) => b[1].total - a[1].total);

  report += 'By operation:\n';
  report += '-'.repeat(60) + '\n';
  report += `${'Label'.padEnd(40)} ${'Count'.padStart(6)} ${'Total (ms)'.padStart(12)} ${'Max (ms)'.padStart(10)}\n`;
  report += '-'.repeat(60) + '\n';

  for (const [label, stats] of sorted) {
    const shortLabel = label.length > 38 ? label.substring(0, 35) + '...' : label;
    report += `${shortLabel.padEnd(40)} ${stats.count.toString().padStart(6)} ${stats.total.toString().padStart(12)} ${stats.max.toString().padStart(10)}\n`;
  }

  report += '\n';
  return report;
}
