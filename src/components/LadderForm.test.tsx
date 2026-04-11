import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import LadderForm from "../components/LadderForm";
import "@testing-library/jest-dom";

describe("LadderForm component", () => {
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
    // Wait for the table to render with players
    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
