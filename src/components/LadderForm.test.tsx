import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LadderForm from "../components/LadderForm";
import "@testing-library/jest-dom";

describe("LadderForm component", () => {
  it("should render the form", () => {
    render(<LadderForm />);
    expect(
      screen.getByText("Bughouse Chess Ladder v1.0.0"),
    ).toBeInTheDocument();
  });

  it("should have load button", () => {
    render(<LadderForm />);
    const loadButton = screen.getByText("Load");
    expect(loadButton).toBeInTheDocument();
  });

  it("should have a Run tests button that can be clicked", () => {
    render(<LadderForm />);
    const runButton = screen.getByText("Run tests");
    expect(runButton).toBeInTheDocument();
    // clicking should not throw since handler simply calls exportPlayers
    fireEvent.click(runButton);
  });

  it("should handle file input change", () => {
    render(<LadderForm />);
    const fileInput = screen.getByLabelText("Load") as HTMLInputElement;
    const file = new File(["test"], "test.txt", { type: "text/plain" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(fileInput.files).toHaveLength(1);
  });
});
