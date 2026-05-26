/**
 * Global request gate — enforces minimum 1-second interval between ALL HTTP requests.
 * Prevents request storms from overwhelming a slow server.
 * Logs every request for debugging.
 */

const MIN_INTERVAL_MS = 1000;
let lastRequestTime = 0;
let requestCount = 0;
let delayedCount = 0;

/**
 * Fetch with global cooldown. Waits up to 1s for the gate to open, then fires.
 * Logs every request with [REQ-GATE] prefix.
 */
export async function gatedFetch(
  url: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  const method = (init && 'method' in init ? (init as any).method : 'GET').toUpperCase();
  const urlStr = url.toString().split('?')[0]; // strip query for brevity

  if (elapsed < MIN_INTERVAL_MS) {
    const wait = MIN_INTERVAL_MS - elapsed;
    // console.log(`[REQ-GATE] ${method} ${urlStr} — DELAYED ${wait}ms (count: ${requestCount}, delayed: ${delayedCount})`);
    delayedCount++;
    await sleep(wait);
  }

  requestCount++;
  lastRequestTime = Date.now();
  // console.log(`[REQ-GATE] ${method} ${urlStr} — SENT #${requestCount}`);

  try {
    const response = await fetch(url, init);
    // console.log(`[REQ-GATE] ${method} ${urlStr} — ${response.status} ${response.statusText}`);
    return response;
  } catch (err) {
    console.warn(`[REQ-GATE] ${method} ${urlStr} — ERROR: ${(err as Error).message}`);
    throw err;
  }
}

/**
 * Check if a request can be sent immediately without delay.
 */
export function canSendNow(): boolean {
  return Date.now() - lastRequestTime >= MIN_INTERVAL_MS;
}

/**
 * Milliseconds until the next request slot opens.
 */
export function msUntilNext(): number {
  const elapsed = Date.now() - lastRequestTime;
  return Math.max(0, MIN_INTERVAL_MS - elapsed);
}

/**
 * Reset gate state (for tests).
 */
export function resetGate(): void {
  lastRequestTime = 0;
  requestCount = 0;
  delayedCount = 0;
}

/**
 * Get gate stats for debugging.
 */
export function getGateStats(): { total: number; delayed: number; lastMsAgo: number } {
  return {
    total: requestCount,
    delayed: delayedCount,
    lastMsAgo: Date.now() - lastRequestTime,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
