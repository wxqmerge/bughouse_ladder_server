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
 * Read debugLevel from localStorage settings. Returns undefined if not found.
 * Keys tried: unprefixed 'ladder_settings', then any key ending with '_ladder_settings'.
 */
function readClientDebugLevel(): number | undefined {
  try {
    type LS = { getItem: (k: string) => string | null; length: number; key: (i: number) => string | null };
    const ls = (globalThis as Record<string, unknown>).localStorage as LS | undefined;
    if (!ls) return undefined;

    let raw = ls.getItem('ladder_settings');
    if (!raw) {
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i);
        if (key && key.endsWith('_ladder_settings')) {
          raw = ls.getItem(key);
          break;
        }
      }
    }
    if (raw) {
      const settings = JSON.parse(raw);
      const level = settings.debugLevel;
      if (typeof level === 'number') return level;
    }
  } catch { /* ignore */ }
  return undefined;
}

/**
 * Fetch with global cooldown. Waits up to 150ms for the gate to open, then fires.
 * Logs every request with [REQ-GATE] prefix.
 * Injects x-debug-level header from client settings.
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

  // Inject x-debug-level header from client settings
  const clientDebugLevel = readClientDebugLevel();
  if (clientDebugLevel !== undefined && init) {
    const headers = init.headers;
    if (headers) {
      if (headers instanceof Headers) {
        headers.set('x-debug-level', String(clientDebugLevel));
      } else if (Array.isArray(headers)) {
        const idx = headers.findIndex(([k]) => k.toLowerCase() === 'x-debug-level');
        if (idx >= 0) headers[idx] = ['x-debug-level', String(clientDebugLevel)];
        else headers.push(['x-debug-level', String(clientDebugLevel)]);
      } else if (typeof headers === 'object') {
        headers['x-debug-level'] = String(clientDebugLevel);
      }
    } else {
      init.headers = { 'x-debug-level': String(clientDebugLevel) };
    }
  }

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
    // Suppress AbortError logging — expected from timed-out health checks
    if ((err as Error).name !== 'AbortError') {
      console.warn(`[REQ-GATE] ${method} ${urlStr} — ERROR: ${(err as Error).message}`);
    }
    throw err;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
