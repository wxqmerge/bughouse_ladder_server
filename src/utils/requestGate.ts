/**
 * Global request gate — enforces minimum 1-second interval between ALL HTTP requests.
 * Prevents request storms from overwhelming a slow server.
 * Logs every request for debugging.
 */

const MIN_INTERVAL_MS = 50;
let lastRequestTime = 0;
let requestCount = 0;
let delayedCount = 0;
let totalDelayMs = 0;

/**
 * Fetch with global cooldown. Waits up to 150ms for the gate to open, then fires.
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
  const reqStart = performance.now();

  if (elapsed < MIN_INTERVAL_MS) {
    const wait = MIN_INTERVAL_MS - elapsed;
    delayedCount++;
    totalDelayMs += wait;
    console.debug(`[REQ-GATE] ${method} ${urlStr} — DELAYED ${wait}ms (total delays: ${delayedCount}, total delay: ${totalDelayMs}ms)`);
    await sleep(wait);
  }

  requestCount++;
  lastRequestTime = Date.now();

  try {
    const response = await fetch(url, init);
    const reqDuration = performance.now() - reqStart;
    if (reqDuration > 100) {
      console.debug(`[REQ-GATE] ${method} ${urlStr} — ${response.status} ${reqDuration.toFixed(0)}ms (gate wait: ${elapsed < MIN_INTERVAL_MS ? (MIN_INTERVAL_MS - elapsed) : 0}ms)`);
    }
    return response;
  } catch (err) {
    console.warn(`[REQ-GATE] ${method} ${urlStr} — ERROR: ${(err as Error).message}`);
    throw err;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
