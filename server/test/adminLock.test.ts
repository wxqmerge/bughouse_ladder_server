import { describe, it, expect, beforeEach } from 'vitest';
import {
  tryAcquireAdminLock,
  forceAcquireAdminLock,
  releaseAdminLock,
  refreshAdminLock,
  getAdminLockInfo,
} from '../src/services/adminLock.service.js';

// Reset lock state before each test by releasing any held lock
function resetLock() {
  const info = getAdminLockInfo();
  if (info.locked && info.lock) {
    releaseAdminLock(info.lock.clientId);
  }
}

beforeEach(() => {
  resetLock();
});

describe('tryAcquireAdminLock', () => {
  it('should acquire lock when no lock exists', () => {
    const result = tryAcquireAdminLock('client_1', 'Client A', '192.168.1.1');
    expect(result.success).toBe(true);
    delete result.heldBy;
    expect(result).toEqual({ success: true });
  });

  it('should reject when lock held by different client', () => {
    tryAcquireAdminLock('client_1', 'Client A', '192.168.1.1');
    const result = tryAcquireAdminLock('client_2', 'Client B', '192.168.1.2');
    
    expect(result.success).toBe(false);
    expect(result.heldBy).toBeDefined();
    expect(result.heldBy!.clientId).toBe('client_1');
    expect(result.heldBy!.clientName).toBe('Client A');
  });

  it('should allow re-acquire by same client', () => {
    tryAcquireAdminLock('client_1', 'Client A', '192.168.1.1');
    const result = tryAcquireAdminLock('client_1', 'Client A', '192.168.1.1');
    
    expect(result.success).toBe(true);
  });

  it('should reject with heldBy info when lock exists', () => {
    tryAcquireAdminLock('holder_a', 'Alice', '10.0.0.1');
    const result = tryAcquireAdminLock('holder_b', 'Bob', '10.0.0.2');
    
    expect(result.success).toBe(false);
    expect(result.heldBy!.clientName).toBe('Alice');
    expect(result.heldBy!.ipAddress).toBe('10.0.0.1');
  });
});

describe('forceAcquireAdminLock', () => {
  it('should acquire lock when no lock exists (no override)', () => {
    const result = forceAcquireAdminLock('client_1', 'Client A', '192.168.1.1');
    
    expect(result.success).toBe(true);
    expect(result.overridden).toBeUndefined();
  });

  it('should override existing lock and return overridden info', () => {
    tryAcquireAdminLock('holder_a', 'Alice', '10.0.0.1');
    const result = forceAcquireAdminLock('client_b', 'Bob', '10.0.0.2');
    
    expect(result.success).toBe(true);
    expect(result.overridden).toBeDefined();
    expect(result.overridden!.clientId).toBe('holder_a');
    expect(result.overridden!.clientName).toBe('Alice');
  });

  it('should succeed even when forcing same client', () => {
    tryAcquireAdminLock('client_1', 'Client A', '192.168.1.1');
    const result = forceAcquireAdminLock('client_1', 'Client A', '192.168.1.1');
    
    expect(result.success).toBe(true);
    expect(result.overridden).toBeUndefined();
  });

  it('should update lock holder after force acquire', () => {
    tryAcquireAdminLock('holder_a', 'Alice', '10.0.0.1');
    forceAcquireAdminLock('holder_b', 'Bob', '10.0.0.2');
    
    const info = getAdminLockInfo();
    expect(info.lock!.clientId).toBe('holder_b');
    expect(info.lock!.clientName).toBe('Bob');
  });
});

describe('releaseAdminLock', () => {
  it('should release lock held by same client', () => {
    tryAcquireAdminLock('client_1', 'Client A', '192.168.1.1');
    const result = releaseAdminLock('client_1');
    
    expect(result).toBe(true);
    
    const info = getAdminLockInfo();
    expect(info.locked).toBe(false);
  });

  it('should fail to release lock held by different client', () => {
    tryAcquireAdminLock('client_1', 'Client A', '192.168.1.1');
    const result = releaseAdminLock('client_2');
    
    expect(result).toBe(false);
    
    const info = getAdminLockInfo();
    expect(info.locked).toBe(true);
  });

  it('should fail to release when no lock exists', () => {
    const result = releaseAdminLock('client_1');
    expect(result).toBe(false);
  });

  it('should fully unlock after release', () => {
    tryAcquireAdminLock('client_1', 'Client A', '192.168.1.1');
    releaseAdminLock('client_1');
    
    // Another client should be able to acquire now
    const result = tryAcquireAdminLock('client_2', 'Client B', '192.168.1.2');
    expect(result.success).toBe(true);
  });
});

describe('refreshAdminLock', () => {
  it('should extend expiration for lock holder', () => {
    tryAcquireAdminLock('client_1', 'Client A', '192.168.1.1');
    
    const result = refreshAdminLock('client_1');
    expect(result).toBe(true);
    
    // Lock should still be locked (not expired)
    const info = getAdminLockInfo();
    expect(info.locked).toBe(true);
  });

  it('should fail to refresh non-existent lock', () => {
    const result = refreshAdminLock('client_1');
    expect(result).toBe(false);
  });

  it('should fail to refresh another client\'s lock', () => {
    tryAcquireAdminLock('client_1', 'Client A', '192.168.1.1');
    const result = refreshAdminLock('client_2');
    
    expect(result).toBe(false);
  });

  it('should return expiresAt timestamp', () => {
    tryAcquireAdminLock('client_1', 'Client A', '192.168.1.1');
    
    const info = getAdminLockInfo();
    expect(info.expiresAt).toBeDefined();
    expect(typeof info.expiresAt).toBe('number');
    expect(info.expiresAt!).toBeGreaterThan(Date.now());
  });
});

describe('getAdminLockInfo', () => {
  it('should return locked=false when no lock exists', () => {
    const info = getAdminLockInfo();
    expect(info.locked).toBe(false);
    expect(info.lock).toBeUndefined();
  });

  it('should return full lock info when locked', () => {
    tryAcquireAdminLock('client_1', 'Client A', '192.168.1.1');
    
    const info = getAdminLockInfo();
    expect(info.locked).toBe(true);
    expect(info.lock!.clientId).toBe('client_1');
    expect(info.lock!.clientName).toBe('Client A');
    expect(info.lock!.ipAddress).toBe('192.168.1.1');
    expect(info.expiresAt).toBeGreaterThan(Date.now());
  });

  it('should return minimal object when not locked', () => {
    const info = getAdminLockInfo();
    expect(info).toEqual({ locked: false });
  });
});

describe('Admin lock workflow', () => {
  it('should support full acquire → refresh → release cycle', () => {
    // Acquire
    let result = tryAcquireAdminLock('client_1', 'Client A', '10.0.0.1');
    expect(result.success).toBe(true);

    // Refresh
    result = refreshAdminLock('client_1');
    expect(result).toBe(true);

    // Check status
    let info = getAdminLockInfo();
    expect(info.locked).toBe(true);
    expect(info.lock!.clientName).toBe('Client A');

    // Release
    result = releaseAdminLock('client_1');
    expect(result).toBe(true);

    // Verify unlocked
    info = getAdminLockInfo();
    expect(info.locked).toBe(false);
  });

  it('should support acquire → force override by another client', () => {
    tryAcquireAdminLock('alice', 'Alice', '10.0.0.1');
    
    const result = forceAcquireAdminLock('bob', 'Bob', '10.0.0.2');
    expect(result.success).toBe(true);
    expect(result.overridden!.clientName).toBe('Alice');

    // Bob now holds the lock
    const info = getAdminLockInfo();
    expect(info.lock!.clientId).toBe('bob');
    
    // Alice can't release Bob's lock
    expect(releaseAdminLock('alice')).toBe(false);
    
    // Bob can release
    expect(releaseAdminLock('bob')).toBe(true);
  });

  it('should support force refresh by same client', () => {
    tryAcquireAdminLock('client_1', 'Client A', '10.0.0.1');
    
    // Force by same client = no override
    const result = forceAcquireAdminLock('client_1', 'Client A', '10.0.0.1');
    expect(result.success).toBe(true);
    expect(result.overridden).toBeUndefined();

    // Should still be locked
    expect(getAdminLockInfo().locked).toBe(true);
  });
});
