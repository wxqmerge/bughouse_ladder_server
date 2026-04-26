/**
 * Tests for Settings component admin gating
 * Verifies that Configuration and Actions panels are hidden in user mode
 * and Server Connection is always visible
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Settings from "../../components/Settings";
import "@testing-library/jest-dom";

describe("Settings admin gating", () => {
  const mockOnClose = vi.fn();
  const mockOnReset = vi.fn();
  const mockOnClearAll = vi.fn();
  const mockOnNewDay = vi.fn();
  const mockOnNewDayWithReRank = vi.fn();
  const mockOnRestoreBackup = vi.fn();
  const mockOnRecalculate = vi.fn();

  const baseProps = {
    onClose: mockOnClose,
    onReset: mockOnReset,
    onClearAll: mockOnClearAll,
    onNewDay: mockOnNewDay,
    onNewDayWithReRank: mockOnNewDayWithReRank,
    onRestoreBackup: mockOnRestoreBackup,
    onRecalculate: mockOnRecalculate,
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("user mode (isAdmin=false)", () => {
    it("should hide Configuration panel when not admin", () => {
      render(<Settings {...baseProps} isAdmin={false} />);

      expect(screen.queryByText("Configuration")).not.toBeInTheDocument();
    });

    it("should hide Actions panel heading when not admin", () => {
      render(<Settings {...baseProps} isAdmin={false} />);

      expect(screen.queryByText("Actions")).not.toBeInTheDocument();
    });

    it("should show Server Connection panel in user mode", () => {
      render(<Settings {...baseProps} isAdmin={false} />);

      expect(screen.getByText("Server Connection")).toBeInTheDocument();
    });

    it("should show Server URL input in user mode", () => {
      render(<Settings {...baseProps} isAdmin={false} />);

      expect(screen.getByLabelText("Server URL")).toBeInTheDocument();
    });

    it("should show API Key input in user mode", () => {
      render(<Settings {...baseProps} isAdmin={false} />);

      expect(screen.getByPlaceholderText(/api key/i)).toBeInTheDocument();
    });

    it("should show Save button in user mode", () => {
      render(<Settings {...baseProps} isAdmin={false} />);

      expect(screen.getByText(/save/i)).toBeInTheDocument();
    });

    it("should not show Configuration settings when not admin", () => {
      render(<Settings {...baseProps} isAdmin={false} />);

      expect(screen.queryByText(/show ratings/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/debug level/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/k-factor/i)).not.toBeInTheDocument();
    });
  });

  describe("admin mode (isAdmin=true)", () => {
    it("should show Configuration panel when admin", () => {
      render(<Settings {...baseProps} isAdmin={true} />);

      expect(screen.getByText("Configuration")).toBeInTheDocument();
    });

    it("should show Show Ratings checkbox when admin", () => {
      render(<Settings {...baseProps} isAdmin={true} />);

      expect(screen.getByText(/show ratings/i)).toBeInTheDocument();
    });

    it("should show Debug Level input when admin", () => {
      render(<Settings {...baseProps} isAdmin={true} />);

      expect(screen.getByLabelText(/debug level/i)).toBeInTheDocument();
    });

    it("should show K-Factor input when admin", () => {
      render(<Settings {...baseProps} isAdmin={true} />);

      expect(screen.getByLabelText(/k-factor/i)).toBeInTheDocument();
    });

    it("should show Server Connection panel when admin", () => {
      render(<Settings {...baseProps} isAdmin={true} />);

      expect(screen.getByText("Server Connection")).toBeInTheDocument();
    });

    it("should show Save button when admin", () => {
      render(<Settings {...baseProps} isAdmin={true} />);

      expect(screen.getByText(/save/i)).toBeInTheDocument();
    });
  });
});
