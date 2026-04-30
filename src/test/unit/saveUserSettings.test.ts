/**
 * Tests for saveUserSettings — whitespace trimming, normalization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadUserSettings, saveUserSettings } from '../../../src/services/userSettingsStorage';
import { derivePrefixFromLocation } from '../../../src/services/storageService';

describe('saveUserSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('whitespace trimming', () => {
    it('should trim server URL whitespace on save', () => {
      saveUserSettings({
        server: '  omen.com:3000  ',
        apiKey: '  mykey  ',
        debugMode: false,
      });

      const loaded = loadUserSettings();
      expect(loaded.server).toBe('http://omen.com:3000');
      expect(loaded.apiKey).toBe('  mykey  ');
    });

    it('should save empty server as empty string', () => {
      saveUserSettings({
        server: '',
        apiKey: '',
        debugMode: false,
      });

      const loaded = loadUserSettings();
      expect(loaded.server).toBe('');
    });

    it('should save whitespace-only server as normalized empty', () => {
      saveUserSettings({
        server: '   ',
        apiKey: '',
        debugMode: false,
      });

      const loaded = loadUserSettings();
      // normalizeServerUrl trims, then checks empty → returns ''
      expect(loaded.server).toBe('');
    });
  });

  describe('API key preservation', () => {
    it('should save API key without trimming', () => {
      saveUserSettings({
        server: 'omen.com:3000',
        apiKey: 'my-api-key',
        debugMode: false,
      });

      const loaded = loadUserSettings();
      expect(loaded.apiKey).toBe('my-api-key');
    });

    it('should save empty API key as empty string', () => {
      saveUserSettings({
        server: 'omen.com:3000',
        apiKey: '',
        debugMode: false,
      });

      const loaded = loadUserSettings();
      expect(loaded.apiKey).toBe('');
    });

    it('should save API key with special characters', () => {
      saveUserSettings({
        server: 'omen.com:3000',
        apiKey: 'abc123-xyz_789',
        debugMode: false,
      });

      const loaded = loadUserSettings();
      expect(loaded.apiKey).toBe('abc123-xyz_789');
    });
  });

  describe('debugMode persistence', () => {
    it('should save debugMode true', () => {
      saveUserSettings({
        server: 'omen.com:3000',
        apiKey: '',
        debugMode: true,
      });

      const loaded = loadUserSettings();
      expect(loaded.debugMode).toBe(true);
    });

    it('should save debugMode false', () => {
      saveUserSettings({
        server: 'omen.com:3000',
        apiKey: '',
        debugMode: false,
      });

      const loaded = loadUserSettings();
      expect(loaded.debugMode).toBe(false);
    });

    it('should default debugMode to false when not set', () => {
      // Simulate old localStorage without debugMode field
      const key = derivePrefixFromLocation('localhost', '/') + 'ladder_user_settings';
      localStorage.setItem(key, JSON.stringify({
        server: 'http://omen.com:3000',
        apiKey: 'test',
      }));

      const loaded = loadUserSettings();
      expect(loaded.debugMode).toBe(false);
    });
  });

  describe('server URL normalization on save', () => {
    it('should add http:// protocol to server URL', () => {
      saveUserSettings({
        server: 'omen.com:3000',
        apiKey: '',
        debugMode: false,
      });

      const loaded = loadUserSettings();
      expect(loaded.server).toBe('http://omen.com:3000');
    });

    it('should preserve existing protocol', () => {
      saveUserSettings({
        server: 'https://omen.com:3000',
        apiKey: '',
        debugMode: false,
      });

      const loaded = loadUserSettings();
      expect(loaded.server).toBe('https://omen.com:3000');
    });

    it('should convert backslashes to forward slashes', () => {
      saveUserSettings({
        server: 'omen\\com:3000',
        apiKey: '',
        debugMode: false,
      });

      const loaded = loadUserSettings();
      expect(loaded.server).toBe('http://omen/com:3000');
    });
  });

  describe('round-trip persistence', () => {
    it('should save and load all fields correctly', () => {
      const original = {
        server: 'omen.com:3000',
        apiKey: 'test-api-key',
        debugMode: true,
      };

      saveUserSettings(original);
      const loaded = loadUserSettings();

      expect(loaded.server).toBe('http://omen.com:3000');
      expect(loaded.apiKey).toBe('test-api-key');
      expect(loaded.debugMode).toBe(true);
    });

    it('should overwrite previous settings', () => {
      saveUserSettings({
        server: 'first.com:3000',
        apiKey: 'first-key',
        debugMode: false,
      });

      saveUserSettings({
        server: 'second.com:3000',
        apiKey: 'second-key',
        debugMode: true,
      });

      const loaded = loadUserSettings();
      expect(loaded.server).toBe('http://second.com:3000');
      expect(loaded.apiKey).toBe('second-key');
      expect(loaded.debugMode).toBe(true);
    });

    it('should handle missing fields gracefully', () => {
      // Old data without all fields — loadUserSettings returns raw stored values
      const key = derivePrefixFromLocation('localhost', '/') + 'ladder_user_settings';
      localStorage.setItem(key, JSON.stringify({
        server: 'http://omen.com:3000',
      }));

      const loaded = loadUserSettings();
      expect(loaded.server).toBe('http://omen.com:3000');
      expect(loaded.apiKey).toBe('');
      expect(loaded.debugMode).toBe(false);
    });
  });

  describe('localStorage key', () => {
    it('should use the correct per-ladder key', () => {
      saveUserSettings({
        server: 'omen.com:3000',
        apiKey: '',
        debugMode: false,
      });

      const key = derivePrefixFromLocation('localhost', '/') + 'ladder_user_settings';
      expect(localStorage.getItem(key)).not.toBeNull();
    });

    it('should store valid JSON', () => {
      saveUserSettings({
        server: 'omen.com:3000',
        apiKey: 'test',
        debugMode: true,
      });

      const key = derivePrefixFromLocation('localhost', '/') + 'ladder_user_settings';
      const stored = localStorage.getItem(key);
      expect(() => JSON.parse(stored!)).not.toThrow();
    });

    it('should use different keys for different ladders', () => {
      const omenKey = derivePrefixFromLocation('bughouse-ladder.com', '/omen') + 'ladder_user_settings';
      const stagingKey = derivePrefixFromLocation('bughouse-ladder.com', '/staging') + 'ladder_user_settings';

      // Simulate two different ladders by writing to their respective keys
      localStorage.setItem(omenKey, JSON.stringify({
        server: 'http://omen.com:3000',
        apiKey: 'omen-key',
        debugMode: true,
      }));

      localStorage.setItem(stagingKey, JSON.stringify({
        server: 'http://staging.com:3001',
        apiKey: 'staging-key',
        debugMode: false,
      }));

      // When we load, we get the current location's key (localhost)
      // But we can verify both keys exist with correct data
      const omenSettings = JSON.parse(localStorage.getItem(omenKey)!);
      const stagingSettings = JSON.parse(localStorage.getItem(stagingKey)!);

      expect(omenSettings.server).toBe('http://omen.com:3000');
      expect(omenSettings.apiKey).toBe('omen-key');
      expect(stagingSettings.server).toBe('http://staging.com:3001');
      expect(stagingSettings.apiKey).toBe('staging-key');
    });
  });
});
