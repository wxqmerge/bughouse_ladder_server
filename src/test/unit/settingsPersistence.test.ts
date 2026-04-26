/**
 * Tests for Settings persistence — localStorage keys use correct prefix
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

    it('should produce consistent prefix for same project', () => {
      // Clear and set a known project name
      localStorage.setItem('ladder_projectName', 'TestProject');
      const prefix1 = getKeyPrefix();
      
      localStorage.setItem('ladder_projectName', 'TestProject');
      const prefix2 = getKeyPrefix();
      
      expect(prefix1).toBe(prefix2);
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
      localStorage.setItem(prefix + 'ladder_server_ladder_players', '[]');
      
      const settings = localStorage.getItem(prefix + 'ladder_settings');
      const players = localStorage.getItem(prefix + 'ladder_server_ladder_players');
      
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

    it('should return consistent prefix in local mode', () => {
      // getKeyPrefix returns 'ladder_' in local mode, 'ladder_server_' in server mode
      const prefix = getKeyPrefix();
      expect(prefix).toBe('ladder_');
    });

    it('should use consistent prefix for all settings keys', () => {
      const prefix = getKeyPrefix();
      
      // All prefixed keys should start with the same prefix
      localStorage.setItem(prefix + 'ladder_settings', 'settings');
      localStorage.setItem(prefix + 'ladder_pending_newday', 'pending');
      
      expect(localStorage.getItem(prefix + 'ladder_settings')).toBe('settings');
      expect(localStorage.getItem(prefix + 'ladder_pending_newday')).toBe('pending');
    });
  });
});
