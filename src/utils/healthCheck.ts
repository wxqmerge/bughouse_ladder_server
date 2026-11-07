// Shared /health endpoint access (audit round-5: the same fetch+parse was
// duplicated in App.tsx and LadderForm.checkServerVersion).
import { gatedFetch, apiKeyHeaders } from './requestGate';

export interface ServerHealth {
  status?: string;
  version?: string;
  writeHealth?: {
    consecutiveFailures: number;
    lastError?: string;
  };
  [key: string]: unknown;
}

/**
 * GET /health on the given server. Sends the stored API key so the server
 * returns the full write-health detail (lastError is hidden from anonymous
 * callers). Returns the parsed payload, or null when the response is not ok.
 * Network errors propagate as exceptions so callers can count failures.
 */
export async function fetchHealth(
  serverUrl: string,
  apiKey?: string | null,
  timeoutMs?: number,
): Promise<ServerHealth | null> {
  const controller = timeoutMs ? new AbortController() : undefined;
  const timeoutId = timeoutMs && controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const response = await gatedFetch(`${serverUrl}/health`, {
      headers: apiKeyHeaders(apiKey),
      signal: controller?.signal,
    });
    if (!response.ok) return null;
    return await response.json() as ServerHealth;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
