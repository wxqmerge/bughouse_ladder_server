/**
 * Tests for basic utility functions
 * Simple unit tests that don't require deep VB6 knowledge
 */

import { describe, it, expect } from 'vitest';
import { getValidationErrorMessage } from '../../../src/utils/constants';

describe('Error Messages', () => {
  it('should return correct message for error code 1', () => {
    expect(getValidationErrorMessage(1)).toBe('Invalid characters');
  });

  it('should return correct message for error code 4', () => {
    expect(getValidationErrorMessage(4)).toBe('Missing result code');
  });

  it('should return correct message for error code 10', () => {
    expect(getValidationErrorMessage(10)).toBe('Conflicting results - players disagree on outcome');
  });

  it('should return unknown error for invalid code', () => {
    expect(getValidationErrorMessage(999)).toBe('Unknown error');
  });
});
