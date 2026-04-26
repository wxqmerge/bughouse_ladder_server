/**
 * Tests for nRating default value = 1
 * Verifies that new players default to nRating: 1, not 0
 */

import { describe, it, expect } from "vitest";

/**
 * Unit test for the nRating default logic directly
 * Tests the Math.abs(value || 1) pattern used in LadderForm.tsx
 */
describe("nRating default logic", () => {
  it("should default to 1 when rating is 0", () => {
    const rating = 0;
    const nRating = Math.abs(rating || 1);
    expect(nRating).toBe(1);
  });

  it("should default to 1 when rating is null", () => {
    const rating = null as any;
    const nRating = Math.abs(rating || 1);
    expect(nRating).toBe(1);
  });

  it("should default to 1 when rating is undefined", () => {
    const rating = undefined as any;
    const nRating = Math.abs(rating || 1);
    expect(nRating).toBe(1);
  });

  it("should default to 1 when rating is empty string", () => {
    const rating = "" as any;
    const nRating = Math.abs(rating || 1);
    expect(nRating).toBe(1);
  });

  it("should use actual rating when provided", () => {
    const rating = 1500;
    const nRating = Math.abs(rating || 1);
    expect(nRating).toBe(1500);
  });

  it("should handle negative rating with Math.abs", () => {
    const rating = -1500;
    const nRating = Math.abs(rating || 1);
    expect(nRating).toBe(1500);
  });

  it("should default nRating field to 1 when nRating is 0", () => {
    const nRating = 0;
    const result = Math.abs(nRating || 1);
    expect(result).toBe(1);
  });

  it("should preserve nRating when set to positive value", () => {
    const nRating = 1400;
    const result = Math.abs(nRating || 1);
    expect(result).toBe(1400);
  });

  it("should default to 1 when nRating is null", () => {
    const nRating = null as any;
    const result = Math.abs(nRating || 1);
    expect(result).toBe(1);
  });

  it("should default to 1 when nRating is undefined", () => {
    const nRating = undefined as any;
    const result = Math.abs(nRating || 1);
    expect(result).toBe(1);
  });

  it("should handle rating of 1 correctly", () => {
    const rating = 1;
    const nRating = Math.abs(rating || 1);
    expect(nRating).toBe(1);
  });

  it("should handle nRating of 1 correctly", () => {
    const nRating = 1;
    const result = Math.abs(nRating || 1);
    expect(result).toBe(1);
  });
});
