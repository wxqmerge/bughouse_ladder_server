/**
 * Tests for normalizeServerUrl — whitespace trimming, protocol prefix, backslash normalization
 */

import { describe, it, expect } from 'vitest';
import { normalizeServerUrl } from '../../../src/services/userSettingsStorage';

describe('normalizeServerUrl', () => {
  describe('whitespace trimming', () => {
    it('should trim leading whitespace', () => {
      expect(normalizeServerUrl('  omen.com:3000')).toBe('http://omen.com:3000');
    });

    it('should trim trailing whitespace', () => {
      expect(normalizeServerUrl('omen.com:3000  ')).toBe('http://omen.com:3000');
    });

    it('should trim both leading and trailing whitespace', () => {
      expect(normalizeServerUrl('  omen.com:3000  ')).toBe('http://omen.com:3000');
    });

    it('should handle tabs and newlines', () => {
      // normalizeServerUrl trims but does NOT lowercase
      expect(normalizeServerUrl('\toMEN.com:3000\n')).toBe('http://oMEN.com:3000');
    });

    it('should return empty string for whitespace-only input', () => {
      expect(normalizeServerUrl('   ')).toBe('');
      expect(normalizeServerUrl('\t\n')).toBe('');
    });
  });

  describe('protocol prefix', () => {
    it('should add http:// when no protocol present', () => {
      expect(normalizeServerUrl('omen.com:3000')).toBe('http://omen.com:3000');
    });

    it('should not add http:// when already has http://', () => {
      expect(normalizeServerUrl('http://omen.com:3000')).toBe('http://omen.com:3000');
    });

    it('should not add http:// when already has https://', () => {
      expect(normalizeServerUrl('https://omen.com:3000')).toBe('https://omen.com:3000');
    });

    it('should handle localhost without protocol', () => {
      expect(normalizeServerUrl('localhost:3000')).toBe('http://localhost:3000');
    });

    it('should handle IP address without protocol', () => {
      expect(normalizeServerUrl('192.168.1.1:3000')).toBe('http://192.168.1.1:3000');
    });
  });

  describe('backslash normalization', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(normalizeServerUrl('omen\\com:3000')).toBe('http://omen/com:3000');
    });

    it('should convert multiple backslashes', () => {
      expect(normalizeServerUrl('omen\\com\\path')).toBe('http://omen/com/path');
    });

    it('should handle mixed slashes', () => {
      expect(normalizeServerUrl('omen/com\\path')).toBe('http://omen/com/path');
    });
  });

  describe('empty and edge cases', () => {
    it('should return empty string for empty input', () => {
      expect(normalizeServerUrl('')).toBe('');
    });

    it('should preserve input with existing protocol', () => {
      expect(normalizeServerUrl('https://example.com/path')).toBe('https://example.com/path');
    });

    it('should handle port numbers', () => {
      expect(normalizeServerUrl('omen.com:8080')).toBe('http://omen.com:8080');
    });

    it('should handle domain with subdomain', () => {
      expect(normalizeServerUrl('api.subdomain.example.com:3000')).toBe('http://api.subdomain.example.com:3000');
    });
  });
});
