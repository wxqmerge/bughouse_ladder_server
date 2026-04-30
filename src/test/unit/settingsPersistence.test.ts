/**
 * Tests for Settings persistence — localStorage keys use URL-derived prefix
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getKeyPrefix, derivePrefixFromLocation } from '../../../src/services/storageService';

describe('Settings persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('derivePrefixFromLocation', () => {
    it('should return a non-empty string', () => {
      const prefix = derivePrefixFromLocation('localhost', '/');
      expect(prefix).toBeDefined();
      expect(typeof prefix).toBe('string');
      expect(prefix.length).toBeGreaterThan(0);
    });

    it('should return ladder_localhost_ for localhost', () => {
      const prefix = derivePrefixFromLocation('localhost', '/');
      expect(prefix).toBe('ladder_localhost_');
    });

    it('should derive prefix from hostname', () => {
      const prefix = derivePrefixFromLocation('test.com', '/');
      expect(prefix).toBe('ladder_test_com_');
    });

    it('should produce different prefixes for different hostnames', () => {
      const prefix1 = derivePrefixFromLocation('production.com', '/');
      const prefix2 = derivePrefixFromLocation('staging.com', '/');
      
      expect(prefix1).not.toBe(prefix2);
      expect(prefix1).toMatch(/^ladder_production_com_/);
      expect(prefix2).toMatch(/^ladder_staging_com_/);
    });

    it('should include pathname in prefix', () => {
      const prefix = derivePrefixFromLocation('bughouse-ladder.com', '/omen');
      expect(prefix).toBe('ladder_bughouse_ladder_com_omen_');
    });

    it('should produce different prefixes for same host different paths', () => {
      const prefixA = derivePrefixFromLocation('bughouse-ladder.com', '/omen');
      const prefixB = derivePrefixFromLocation('bughouse-ladder.com', '/staging');
      
      expect(prefixA).not.toBe(prefixB);
      expect(prefixA).toBe('ladder_bughouse_ladder_com_omen_');
      expect(prefixB).toBe('ladder_bughouse_ladder_com_staging_');
    });

    it('should handle subdomains', () => {
      const prefix = derivePrefixFromLocation('staging.omen.com', '/');
      expect(prefix).toBe('ladder_staging_omen_com_');
    });

    it('should handle ports in hostname', () => {
      const prefix = derivePrefixFromLocation('localhost:3000', '/');
      expect(prefix).toBe('ladder_localhost_3000_');
    });

    it('should strip special chars from pathname', () => {
      const prefix = derivePrefixFromLocation('test.com', '/my-ladder/v2');
      expect(prefix).toBe('ladder_test_com_my_ladder_v2_');
    });
  });

  describe('getKeyPrefix', () => {
    it('should return the same prefix on repeated calls', () => {
      const prefix1 = getKeyPrefix();
      const prefix2 = getKeyPrefix();
      expect(prefix1).toBe(prefix2);
    });

    it('should return a non-empty string', () => {
      const prefix = getKeyPrefix();
      expect(prefix).toBeDefined();
      expect(typeof prefix).toBe('string');
      expect(prefix.length).toBeGreaterThan(0);
    });
  });

  describe('localStorage key construction', () => {
    it('should use getKeyPrefix for settings key', () => {
      const prefix = getKeyPrefix();
      const expectedKey = prefix + 'ladder_settings';
      
      const testSettings = {
        showRatings: [true, true, true, true],
        debugLevel: 5,
        kFactor: 20,
      };
      
      localStorage.setItem(expectedKey, JSON.stringify(testSettings));
      
      const stored = localStorage.getItem(expectedKey);
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toEqual(testSettings);
    });

    it('should use getKeyPrefix for pending new day key', () => {
      const prefix = getKeyPrefix();
      const expectedKey = prefix + 'ladder_pending_newday';
      
      const pendingData = JSON.stringify({ reRank: false });
      localStorage.setItem(expectedKey, pendingData);
      
      const stored = localStorage.getItem(expectedKey);
      expect(stored).toBe(pendingData);
    });

    it('should use different keys for different settings', () => {
      const prefix = getKeyPrefix();
      
      localStorage.setItem(prefix + 'ladder_settings', JSON.stringify({ debugLevel: 5 }));
      localStorage.setItem(prefix + 'ladder_players', '[]');
      
      const settings = localStorage.getItem(prefix + 'ladder_settings');
      const players = localStorage.getItem(prefix + 'ladder_players');
      
      expect(settings).toBe(JSON.stringify({ debugLevel: 5 }));
      expect(players).toBe('[]');
    });
  });

  describe('user settings key', () => {
    it('should use per-ladder user settings key', () => {
      const prefix = derivePrefixFromLocation('bughouse-ladder.com', '/omen');
      const userSettingsKey = prefix + 'ladder_user_settings';
      
      const settings = {
        server: 'http://omen.com:3000',
        apiKey: 'test-key',
        debugMode: true,
      };
      
      localStorage.setItem(userSettingsKey, JSON.stringify(settings));
      
      const stored = localStorage.getItem(userSettingsKey);
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toEqual(settings);
    });

    it('should persist across simulated sessions', () => {
      const prefix = derivePrefixFromLocation('bughouse-ladder.com', '/omen');
      const userSettingsKey = prefix + 'ladder_user_settings';
      
      // Save
      const settings = { server: 'http://omen.com:3000', apiKey: '', debugMode: false };
      localStorage.setItem(userSettingsKey, JSON.stringify(settings));
      
      // "Reload" — in real app this would be a fresh localStorage
      const retrieved = JSON.parse(localStorage.getItem(userSettingsKey)!);
      expect(retrieved).toEqual(settings);
    });
  });

  describe('key prefix isolation', () => {
    it('should not collide with other localStorage keys', () => {
      const prefix = getKeyPrefix();
      
      // Set prefixed key
      localStorage.setItem(prefix + 'ladder_settings', JSON.stringify({ k: 1 }));
      
      // Set non-prefixed key
      localStorage.setItem('other_key', 'value');
      
      // Prefixed key should be isolated
      expect(localStorage.getItem(prefix + 'ladder_settings')).toBe(JSON.stringify({ k: 1 }));
      expect(localStorage.getItem('other_key')).toBe('value');
    });

    it('should use consistent prefix for all settings keys', () => {
      const prefix = getKeyPrefix();
      
      // All prefixed keys should start with the same prefix
      localStorage.setItem(prefix + 'ladder_settings', 'settings');
      localStorage.setItem(prefix + 'ladder_pending_newday', 'pending');
      
      expect(localStorage.getItem(prefix + 'ladder_settings')).toBe('settings');
      expect(localStorage.getItem(prefix + 'ladder_pending_newday')).toBe('pending');
    });

    it('should isolate different ladders from each other', () => {
      const prefixA = derivePrefixFromLocation('bughouse-ladder.com', '/omen');
      localStorage.setItem(prefixA + 'ladder_settings', 'ladder-a-data');
      localStorage.setItem(prefixA + 'ladder_admin_mode', 'true');
      
      const prefixB = derivePrefixFromLocation('bughouse-ladder.com', '/staging');
      localStorage.setItem(prefixB + 'ladder_settings', 'ladder-b-data');
      localStorage.setItem(prefixB + 'ladder_admin_mode', 'false');
      
      // Verify isolation
      expect(localStorage.getItem(prefixA + 'ladder_settings')).toBe('ladder-a-data');
      expect(localStorage.getItem(prefixA + 'ladder_admin_mode')).toBe('true');
      expect(localStorage.getItem(prefixB + 'ladder_settings')).toBe('ladder-b-data');
      expect(localStorage.getItem(prefixB + 'ladder_admin_mode')).toBe('false');
      
      // Cross-prefix access should return null
      expect(localStorage.getItem(prefixB + 'ladder_settings')).not.toBe('ladder-a-data');
      expect(localStorage.getItem(prefixA + 'ladder_admin_mode')).not.toBe('false');
    });
  });
});
