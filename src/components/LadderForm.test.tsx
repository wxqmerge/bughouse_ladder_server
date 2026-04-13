import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import LadderForm from "./LadderForm";
import "@testing-library/jest-dom";

describe("LadderForm component", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should render the title", async () => {
    render(<LadderForm />);
    // Component loads sample data, wait for it to render
    await waitFor(() => {
      expect(screen.getByText(/Bughouse Chess Ladder/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("should load sample data on mount", async () => {
    render(<LadderForm />);
    // Wait for sample data to be loaded (shows player table)
    await waitFor(() => {
      expect(screen.queryByText(/Loading sample data/i)).not.toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("should display players after loading", async () => {
    render(<LadderForm />);
    // Wait for the "Load Sample Data" button to appear
    await screen.findByText(/Load Sample Data/i);
    // Click the button to load sample data
    fireEvent.click(screen.getByText(/Load Sample Data/i));
    // Wait for the table to render with players
    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});