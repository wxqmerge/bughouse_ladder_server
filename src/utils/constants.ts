/**
 * Shared timeout constants for network operations.
 * Centralized to avoid magic numbers and ensure consistency.
 */

export const TIMEOUTS = {
  /** Quick health check probe (same-origin auto-detect) */
  HEALTH_CHECK_MS: 3000,

  /** API endpoint validation (validateServerUrl) */
  API_VALIDATE_MS: 5000,

  /** Batch commit server sync */
  BATCH_COMMIT_MS: 5000,

  /** Periodic health check interval (write health monitoring) */
  HEALTH_CHECK_INTERVAL_MS: 30000,

  /** Periodic connection state check interval */
  PERIODIC_CHECK_INTERVAL_MS: 10000,

  /** Data polling interval (server mode) */
  DATA_POLL_INTERVAL_MS: 60000,

  /** Delta flush interval */
  DELTA_FLUSH_INTERVAL_MS: 5000,

  /** Refresh dedup window (SSE event coalescing) */
  REFRESH_DEDUP_MS: 300,

  /** SSE notification debounce */
  SSE_NOTIFY_DEBOUNCE_MS: 100,
} as const;
