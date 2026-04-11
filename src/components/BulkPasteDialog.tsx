import { useState, useEffect } from "react";
import { X, ClipboardPaste, CheckCircle, AlertTriangle, Table } from "lucide-react";
import { updatePlayerGameData } from "../utils/hashUtils";
import type { PlayerData } from "../utils/hashUtils";

interface ParsedResult {
  input: string;
  validated: ReturnType<typeof updatePlayerGameData>;
  isValid: boolean;
}

interface AssignmentPreview {
  playerRank: number;
  playerName: string;
  roundIndex: number;
  resultString: string;
}

interface BulkPasteDialogProps {
  players: PlayerData[];
  onClose: () => void;
  onApplyResults: (results: AssignmentPreview[]) => void;
}

export function BulkPasteDialog({
  players,
  onClose,
  onApplyResults,
}: BulkPasteDialogProps) {
  const [inputText, setInputText] = useState("");
  const [parsedResults, setParsedResults] = useState<ParsedResult[]>([]);
  const [assignmentPreview, setAssignmentPreview] = useState<AssignmentPreview[]>([]);

  // Parse input and generate assignment preview
  useEffect(() => {
    if (!inputText.trim()) {
      setParsedResults([]);
      setAssignmentPreview([]);
      return;
    }

    // Split by any whitespace (tabs, newlines, spaces)
    const rawResults = inputText
      .split(/\s+/)
      .filter((r) => r.trim() !== "")
      .map((r) => r.toUpperCase().replace(/[^0-9WLD:]/g, ""));

    const parsed: ParsedResult[] = rawResults.map((input) => {
      const validated = updatePlayerGameData(input, true);
      return {
        input,
        validated,
        isValid: validated.isValid && input !== "",
      };
    });

    setParsedResults(parsed);

    // Generate assignment preview - find first empty round for each player in each result
    const preview: AssignmentPreview[] = [];

    for (const result of parsed) {
      if (!result.isValid) continue;

      // Get player ranks from the validated result
      const playerRanks = [
        result.validated.parsedPlayer1Rank || 0,
        result.validated.parsedPlayer2Rank || 0,
        result.validated.parsedPlayer3Rank || 0,
        result.validated.parsedPlayer4Rank || 0,
      ].filter((r) => r > 0);

      // Find the result string to store (add underscore)
      const resultString = result.validated.resultString || result.input + "_";

      // For each player in this game, find their first empty round
      for (const playerRank of playerRanks) {
        const player = players.find((p) => p.rank === playerRank);
        if (!player) continue;

        // Find first empty round
        let roundIndex = -1;
        for (let r = 0; r < player.gameResults.length; r++) {
          if (player.gameResults[r] === null || player.gameResults[r] === "") {
            roundIndex = r;
            break;
          }
        }

        if (roundIndex >= 0) {
          preview.push({
            playerRank,
            playerName: `${player.firstName} ${player.lastName}`,
            roundIndex,
            resultString,
          });
        }
      }
    }

    setAssignmentPreview(preview);
  }, [inputText, players]);

  const validCount = parsedResults.filter((r) => r.isValid).length;
  const invalidCount = parsedResults.length - validCount;

  const handleApply = () => {
    if (validCount === 0 || assignmentPreview.length === 0) {
      alert("No valid results to apply or no empty rounds available.");
      return;
    }

    onApplyResults(assignmentPreview);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "0.5rem",
          padding: "1.5rem",
          maxWidth: "700px",
          width: "90%",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <h2
            style={{
              fontSize: "1.25rem",
              fontWeight: "600",
              color: "#3b82f6",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <ClipboardPaste size={20} />
            Paste Multiple Results
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={24} color="#6b7280" />
          </button>
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label
            htmlFor="bulkPasteInput"
            style={{
              display: "block",
              fontSize: "0.875rem",
              fontWeight: "500",
              color: "#374151",
              marginBottom: "0.5rem",
            }}
          >
            Paste Results (separated by spaces, tabs, or newlines):
          </label>
          <textarea
            id="bulkPasteInput"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="5W3 7L2 9D4 11W6 3L8\nor paste from clipboard..."
            rows={6}
            style={{
              width: "100%",
              padding: "0.75rem",
              border: "1px solid #d1d5db",
              borderRadius: "0.25rem",
              fontSize: "0.875rem",
              fontFamily: "monospace",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          <p
            style={{
              fontSize: "0.75rem",
              color: "#9ca3af",
              marginTop: "0.25rem",
            }}
          >
            Each result will be automatically validated and cleaned (uppercase, non-game characters removed)
          </p>
        </div>

        {/* Summary */}
        {parsedResults.length > 0 && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.75rem",
              backgroundColor: invalidCount > 0 ? "#fef3c7" : "#ecfdf5",
              borderRadius: "0.25rem",
              border: invalidCount > 0 ? "1px solid #f59e0b" : "1px solid #10b981",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              {invalidCount > 0 ? (
                <AlertTriangle size={16} color="#92400e" />
              ) : (
                <CheckCircle size={16} color="#059669" />
              )}
              <span
                style={{
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: invalidCount > 0 ? "#92400e" : "#059669",
                }}
              >
                {validCount} valid, {invalidCount} invalid out of {parsedResults.length} results
              </span>
            </div>
            {invalidCount > 0 && (
              <details style={{ fontSize: "0.75rem", color: "#78350f" }}>
                <summary style={{ cursor: "pointer", marginTop: "0.25rem" }}>
                  Show invalid results
                </summary>
                <div style={{ marginTop: "0.5rem" }}>
                  {parsedResults
                    .filter((r) => !r.isValid)
                    .slice(0, 5)
                    .map((r, idx) => (
                      <div key={idx}>{r.input} - Error code: {r.validated.error}</div>
                    ))}
                  {parsedResults.filter((r) => !r.isValid).length > 5 && (
                    <div>...and {parsedResults.filter((r) => !r.isValid).length - 5} more</div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Assignment Preview */}
        {assignmentPreview.length > 0 && (
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: "500",
                color: "#374151",
                marginBottom: "0.5rem",
              }}
            >
              <Table size={16} />
              Results will be placed in first empty rounds:
            </label>
            <div
              style={{
                maxHeight: "200px",
                overflow: "auto",
                border: "1px solid #e5e7eb",
                borderRadius: "0.25rem",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.75rem",
                }}
              >
                <thead
                  style={{
                    backgroundColor: "#f9fafb",
                    position: "sticky",
                    top: 0,
                  }}
                >
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0.5rem",
                        borderBottom: "2px solid #e5e7eb",
                        fontWeight: "600",
                        color: "#374151",
                      }}
                    >
                      Player
                    </th>
                    <th
                      style={{
                        textAlign: "center",
                        padding: "0.5rem",
                        borderBottom: "2px solid #e5e7eb",
                        fontWeight: "600",
                        color: "#374151",
                      }}
                    >
                      Round
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "0.5rem",
                        borderBottom: "2px solid #e5e7eb",
                        fontWeight: "600",
                        color: "#374151",
                      }}
                    >
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {assignmentPreview.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td
                        style={{
                          padding: "0.5rem",
                          color: "#374151",
                        }}
                      >
                        <strong>{item.playerRank}</strong>. {item.playerName}
                      </td>
                      <td
                        style={{
                          textAlign: "center",
                          padding: "0.5rem",
                          color: "#059669",
                          fontWeight: "600",
                        }}
                      >
                        {item.roundIndex + 1}
                      </td>
                      <td
                        style={{
                          padding: "0.5rem",
                          fontFamily: "monospace",
                          color: "#1e40af",
                        }}
                      >
                        {item.resultString}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p
              style={{
                fontSize: "0.75rem",
                color: "#6b7280",
                marginTop: "0.25rem",
              }}
            >
              Each result is entered for all participating players in their first available round.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "0.75rem 1.5rem",
              background: "#f3f4f6",
              border: "1px solid #d1d5db",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.875rem",
              color: "#374151",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={validCount === 0 || assignmentPreview.length === 0}
            style={{
              padding: "0.75rem 1.5rem",
              background: validCount > 0 && assignmentPreview.length > 0 ? "#3b82f6" : "#9ca3af",
              border: "none",
              borderRadius: "0.25rem",
              cursor: validCount > 0 && assignmentPreview.length > 0 ? "pointer" : "not-allowed",
              fontSize: "0.875rem",
              color: "white",
            }}
          >
            Apply {assignmentPreview.length} Entries
          </button>
        </div>

        {/* Help Text */}
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem",
            backgroundColor: "#f0f9ff",
            borderRadius: "0.25rem",
            fontSize: "0.75rem",
            color: "#0369a1",
          }}
        >
          <strong>How it works:</strong>
          <br />
          Each result is entered for ALL players in that game, placed in their first empty round.
          <br />
          Example: <code style={{ backgroundColor: "#e0f2fe", padding: "0.125rem 0.25rem", borderRadius: "0.125rem" }}>5W3</code> → enters result for both player 5 AND player 3
          <br />
          <strong>Examples:</strong>
          <br />
          • Single line: <code style={{ backgroundColor: "#e0f2fe", padding: "0.125rem 0.25rem", borderRadius: "0.125rem" }}>5W3 7L2 9D4</code>
          <br />
          • Multiple lines: paste from spreadsheet or text file
        </div>
      </div>
    </div>
  );
}
