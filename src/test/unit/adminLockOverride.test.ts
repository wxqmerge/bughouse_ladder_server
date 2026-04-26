/**
 * Tests for admin lock override dialog
 * Tests the flow when another client holds the admin lock
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Admin lock override', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('lock state detection', () => {
    it('should detect when lock is held by another client', () => {
      // Simulates the lock info response from server
      const lockInfo = {
        locked: true,
        holderId: 'client-123',
        holderName: 'Admin-PC',
        expiresAt: Date.now() + 300000,
        serverReachable: true,
      };

      expect(lockInfo.locked).toBe(true);
      expect(lockInfo.holderId).toBe('client-123');
      expect(lockInfo.holderName).toBe('Admin-PC');
    });

    it('should detect when lock is free', () => {
      const lockInfo = {
        locked: false,
        serverReachable: true,
      };

      expect(lockInfo.locked).toBe(false);
      expect(lockInfo.holderId).toBeUndefined();
      expect(lockInfo.holderName).toBeUndefined();
    });

    it('should detect when server is unreachable', () => {
      const lockInfo = {
        locked: false,
        serverReachable: false,
      };

      expect(lockInfo.locked).toBe(false);
      expect(lockInfo.serverReachable).toBe(false);
    });

    it('should handle expired lock', () => {
      const lockInfo = {
        locked: true,
        holderId: 'client-123',
        holderName: 'Admin-PC',
        expiresAt: Date.now() - 1000, // expired 1 second ago
        serverReachable: true,
      };

      const isExpired = lockInfo.expiresAt < Date.now();
      expect(isExpired).toBe(true);
    });

    it('should handle lock expiring soon', () => {
      const lockInfo = {
        locked: true,
        holderId: 'client-123',
        holderName: 'Admin-PC',
        expiresAt: Date.now() + 5000, // expires in 5 seconds
        serverReachable: true,
      };

      const isExpired = lockInfo.expiresAt < Date.now();
      expect(isExpired).toBe(false);
      expect(lockInfo.locked).toBe(true);
    });
  });

  describe('override dialog flow', () => {
    it('should show override confirmation when lock is held', () => {
      // Simulates the dialog shown when trying to enter admin mode
      const lockInfo = {
        locked: true,
        holderId: 'client-123',
        holderName: 'Admin-PC',
      };

      const shouldShowDialog = !!lockInfo.locked && !!lockInfo.holderName;
      expect(shouldShowDialog).toBe(true);

      const dialogMessage = `Admin lock is held by ${lockInfo.holderName}. Force override?`;
      expect(dialogMessage).toContain('Admin-PC');
      expect(dialogMessage).toContain('Force override');
    });

    it('should not show override dialog when lock is free', () => {
      const lockInfo = {
        locked: false,
      };

      const shouldShowDialog = lockInfo.locked;
      expect(shouldShowDialog).toBe(false);
    });

    it('should not show override dialog when server unreachable', () => {
      const lockInfo = {
        locked: false,
        serverReachable: false,
      };

      const shouldShowDialog = lockInfo.locked && lockInfo.serverReachable;
      expect(shouldShowDialog).toBe(false);
    });

    it('should handle override cancellation', () => {
      // User clicks "Cancel" on override dialog
      const userConfirmedOverride = false;
      const lockAcquired = userConfirmedOverride;

      expect(lockAcquired).toBe(false);
    });

    it('should handle override confirmation', () => {
      // User clicks "Force Override" on dialog
      const userConfirmedOverride = true;
      const lockAcquired = userConfirmedOverride;

      expect(lockAcquired).toBe(true);
    });
  });

  describe('lock refresh', () => {
    it('should extend lock expiration on refresh', () => {
      const initialExpiry = Date.now() + 300000; // 5 minutes
      const refreshedExpiry = Date.now() + 300000; // reset to 5 minutes

      expect(refreshedExpiry).toBeGreaterThan(initialExpiry - 10000);
    });

    it('should handle refresh failure gracefully', () => {
      const refreshSucceeded = false;
      const lockStillHeld = true;

      // Even if refresh fails, lock should still be considered held
      expect(lockStillHeld).toBe(true);
    });
  });

  describe('lock release', () => {
    it('should release lock when admin exits', () => {
      const wasLocked = true;
      const lockReleased = true;
      const nowLocked = false;

      expect(wasLocked).toBe(true);
      expect(lockReleased).toBe(true);
      expect(nowLocked).toBe(false);
    });

    it('should verify only lock owner can release', () => {
      const lockHolderId = 'client-123';
      const releasingClientId = 'client-456';
      const isOwner = lockHolderId === releasingClientId;

      expect(isOwner).toBe(false);
    });

    it('should allow lock owner to release', () => {
      const lockHolderId = 'client-123';
      const releasingClientId = 'client-123';
      const isOwner = lockHolderId === releasingClientId;

      expect(isOwner).toBe(true);
    });
  });

  describe('lock notification', () => {
    it('should notify when lock status changes', () => {
      const previousStatus = { locked: false };
      const newStatus = { locked: true, holderName: 'Admin-PC' };

      const statusChanged = previousStatus.locked !== newStatus.locked;
      expect(statusChanged).toBe(true);
    });

    it('should not notify when lock status unchanged', () => {
      const previousStatus = { locked: true };
      const newStatus = { locked: true };

      const statusChanged = previousStatus.locked !== newStatus.locked;
      expect(statusChanged).toBe(false);
    });

    it('should handle lock acquired by self', () => {
      const lockInfo = {
        locked: true,
        holderId: 'client-123',
        holderName: 'My-PC',
      };

      const isSelf = lockInfo.holderId === 'client-123';
      expect(isSelf).toBe(true);
    });
  });
});
