/**
 * Server-side admin lock management
 * Single source of truth for admin mode access across all clients
 */

import { getTimestamp } from '../utils/timestamp.js';

const ADMIN_LOCK_TIMEOUT = 60000; // 60 seconds

export interface AdminLock {
  clientId: string;
  clientName: string;
  ipAddress: string;
  acquiredAt: number;
}

// In-memory lock storage (could be Redis in production)
let currentLock: AdminLock | null = null;

/**
 * Check if current lock is expired
 */
function isLockExpired(): boolean {
  if (!currentLock) return true;
  return Date.now() - currentLock.acquiredAt >= ADMIN_LOCK_TIMEOUT;
}

/**
 * Try to acquire admin lock
 */
export function tryAcquireAdminLock(clientId: string, clientName: string, ipAddress: string): { success: boolean; heldBy?: AdminLock } {
  // Check if we can acquire (no lock, expired, or same client)
  const canAcquire = !currentLock || isLockExpired() || currentLock.clientId === clientId;
  
  if (canAcquire) {
    currentLock = {
      clientId,
      clientName,
      ipAddress,
      acquiredAt: Date.now(),
    };
    console.log(`[${getTimestamp()}] [ADMIN_LOCK] ${ipAddress} (${clientName}) ACQUIRED lock`);
    return { success: true };
  }
  
  // Lock held by someone else
  if (currentLock) {
    console.log(`[${getTimestamp()}] [ADMIN_LOCK] ${ipAddress} (${clientName}) FAILED - held by ${currentLock.clientName} (${currentLock.ipAddress})`);
    return { success: false, heldBy: currentLock };
  }
  return { success: false };
}

/**
 * Force acquire admin lock (override existing)
 */
export function forceAcquireAdminLock(clientId: string, clientName: string, ipAddress: string): { success: boolean; overridden?: AdminLock } {
  const previousLock = currentLock;
  
  currentLock = {
    clientId,
    clientName,
    ipAddress,
    acquiredAt: Date.now(),
  };
  
  if (previousLock && previousLock.clientId !== clientId) {
    console.log(`[${getTimestamp()}] [ADMIN_LOCK] ${ipAddress} (${clientName}) FORCED - overridden ${previousLock.clientName} (${previousLock.ipAddress})`);
    return { success: true, overridden: previousLock };
  }
  
  console.log(`[${getTimestamp()}] [ADMIN_LOCK] ${ipAddress} (${clientName}) ACQUIRED lock (force)`);
  return { success: true };
}

/**
 * Release admin lock
 */
export function releaseAdminLock(clientId: string): boolean {
  if (currentLock && currentLock.clientId === clientId) {
    console.log(`[${getTimestamp()}] [ADMIN_LOCK] ${currentLock.ipAddress} (${currentLock.clientName}) RELEASED lock`);
    currentLock = null;
    return true;
  }
  return false;
}

/**
 * Refresh admin lock (extend expiration)
 */
export function refreshAdminLock(clientId: string): boolean {
  if (currentLock && currentLock.clientId === clientId) {
    currentLock.acquiredAt = Date.now();
    console.log(`[${getTimestamp()}] [ADMIN_LOCK] ${currentLock.ipAddress} (${currentLock.clientName}) REFRESHED lock`);
    return true;
  }
  return false;
}

/**
 * Get current lock info
 */
export function getAdminLockInfo(): { locked: boolean; lock?: AdminLock; expiresAt?: number } {
  if (!currentLock) {
    return { locked: false };
  }
  
  const isExpired = isLockExpired();
  return {
    locked: !isExpired,
    lock: currentLock,
    expiresAt: isExpired ? undefined : currentLock.acquiredAt + ADMIN_LOCK_TIMEOUT,
  };
}
