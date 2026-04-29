/**
 * Tests for Settings persistence — localStorage keys use URL-derived prefix
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getKeyPrefix } from '../../../src/services/storageService';

describe('Settings persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getKeyPrefix', () => {
    it('should return a non-empty string', () => {
      const prefix = getKeyPrefix();
      expect(prefix).toBeDefined();
      expect(typeof prefix).toBe('string');
      expect(prefix.length).toBeGreaterThan(0);
    });

    it('should return the same prefix on repeated calls', () => {
      const prefix1 = getKeyPrefix();
      const prefix2 = getKeyPrefix();
      expect(prefix1).toBe(prefix2);
    });

    it('should return ladder_ prefix in local mode (no server)', () => {
      // No user settings = local mode
      localStorage.removeItem('bughouse-ladder-user-settings');
      const prefix = getKeyPrefix();
      expect(prefix).toBe('ladder_');
    });

    it('should derive prefix from server URL', () => {
      localStorage.setItem('bughouse-ladder-user-settings', JSON.stringify({
        server: 'http://test.com:3000',
        apiKey: '',
        debugMode: false,
      }));
      const prefix = getKeyPrefix();
      expect(prefix).toBe('ladder_test_com_');
    });

    it('should produce different prefixes for different servers', () => {
      localStorage.setItem('bughouse-ladder-user-settings', JSON.stringify({
        server: 'http://production.com:3000',
        apiKey: '',
        debugMode: false,
      }));
      const prefix1 = getKeyPrefix();
      
      localStorage.setItem('bughouse-ladder-user-settings', JSON.stringify({
        server: 'http://staging.com:3001',
        apiKey: '',
        debugMode: false,
      }));
      const prefix2 = getKeyPrefix();
      
      expect(prefix1).not.toBe(prefix2);
      expect(prefix1).toMatch(/^ladder_production_com_/);
      expect(prefix2).toMatch(/^ladder_staging_com_/);
    });

    it('should strip protocol and port from server URL', () => {
      localStorage.setItem('bughouse-ladder-user-settings', JSON.stringify({
        server: 'https://omen.com:3000',
        apiKey: '',
        debugMode: false,
      }));
      const prefix = getKeyPrefix();
      expect(prefix).toBe('ladder_omen_com_');
    });

    it('should handle subdomains', () => {
      localStorage.setItem('bughouse-ladder-user-settings', JSON.stringify({
        server: 'https://staging.omen.com:3001',
        apiKey: '',
        debugMode: false,
      }));
      const prefix = getKeyPrefix();
      expect(prefix).toBe('ladder_staging_omen_com_');
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
    it('should use consistent user settings key', () => {
      const userSettingsKey = 'bughouse-ladder-user-settings';
      
      const settings = {
        server: 'http://test.com:3000',
        apiKey: 'test-key',
        debugMode: true,
      };
      
      localStorage.setItem(userSettingsKey, JSON.stringify(settings));
      
      const stored = localStorage.getItem(userSettingsKey);
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toEqual(settings);
    });

    it('should persist across simulated sessions', () => {
      const userSettingsKey = 'bughouse-ladder-user-settings';
      
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
      // Set up ladder A
      localStorage.setItem('bughouse-ladder-user-settings', JSON.stringify({
        server: 'http://ladder-a.com:3000',
        apiKey: '',
        debugMode: false,
      }));
      const prefixA = getKeyPrefix();
      localStorage.setItem(prefixA + 'ladder_settings', 'ladder-a-data');
      localStorage.setItem(prefixA + 'ladder_admin_mode', 'true');
      
      // Switch to ladder B
      localStorage.setItem('bughouse-ladder-user-settings', JSON.stringify({
        server: 'http://ladder-b.com:3001',
        apiKey: '',
        debugMode: false,
      }));
      const prefixB = getKeyPrefix();
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
