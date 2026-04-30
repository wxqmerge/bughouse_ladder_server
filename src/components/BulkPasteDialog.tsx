import { useState, useEffect } from "react";
import { X, ClipboardPaste, CheckCircle, AlertTriangle, Table } from "lucide-react";
import { updatePlayerGameData } from "../utils/hashUtils";
import type { PlayerData } from "../utils/hashUtils";

interface AssignmentPreview {
  cellOwnerRank: number;
  parsedPlayerRank: number;
  parsedPlayerName: string;
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
  const [assignmentPreview, setAssignmentPreview] = useState<AssignmentPreview[]>([]);

  // Parse input and generate assignment preview - just fill cells sequentially
  useEffect(() => {
    if (!inputText.trim()) {
      setAssignmentPreview([]);
      return;
    }

    // Convert escape sequences to actual characters
    const processedInput = inputText
      .replace(/\\t/g, '\t')   // \t → tab
      .replace(/\\n/g, '\n')   // \n → newline
      .replace(/\\r/g, '\r');  // \r → carriage return

    // Split by any whitespace (tabs, newlines, spaces)
    const rawEntries = processedInput
      .split(/\s+/)
      .filter((r) => r.trim() !== "")
      .map((r) => r.toUpperCase().replace(/[^0-9WLD:]/g, ""));

    // Generate assignment preview - fill cells sequentially across all players
    const preview: AssignmentPreview[] = [];

    // Track next empty round for each player
    const nextEmptyRound = new Map<number, number>();
    
    // Initialize next empty round for each player
    for (const player of players) {
      let firstEmpty = -1;
      for (let r = 0; r < player.gameResults.length; r++) {
        if (player.gameResults[r] === null || player.gameResults[r] === "") {
          firstEmpty = r;
          break;
        }
      }
      nextEmptyRound.set(player.rank, firstEmpty);
    }

    // Assign each entry to the next available cell
    for (const entry of rawEntries) {
      // Find player with earliest empty round that still has room
      let targetPlayerRank = -1;
      let minRoundIndex = Infinity;

      for (const [playerRank, roundIndex] of nextEmptyRound.entries()) {
        if (roundIndex >= 0 && roundIndex < minRoundIndex) {
          minRoundIndex = roundIndex;
          targetPlayerRank = playerRank;
        }
      }

      if (targetPlayerRank > 0 && minRoundIndex < Infinity) {
        const player = players.find((p) => p.rank === targetPlayerRank);
        const parsed = updatePlayerGameData(entry, false);
        const primaryPlayerRank = parsed.parsedPlayer1Rank || 0;
        const primaryPlayer = players.find((p) => p.rank === primaryPlayerRank);
        
        if (player) {
          preview.push({
            cellOwnerRank: targetPlayerRank,
            parsedPlayerRank: primaryPlayerRank,
            parsedPlayerName: primaryPlayer
              ? `${primaryPlayer.firstName} ${primaryPlayer.lastName}`
              : `Unknown (${primaryPlayerRank})`,
            roundIndex: minRoundIndex,
            resultString: entry,
          });

          // Update next empty round for this player
          let nextRound = minRoundIndex + 1;
          while (nextRound < player.gameResults.length) {
            if (player.gameResults[nextRound] === null || player.gameResults[nextRound] === "") {
              break;
            }
            nextRound++;
          }
          nextEmptyRound.set(targetPlayerRank, nextRound >= player.gameResults.length ? -1 : nextRound);
        }
      }
    }

    setAssignmentPreview(preview);
  }, [inputText, players]);

  const totalEntries = inputText.trim() ? 
    inputText
      .replace(/\\t/g, '\t')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .split(/\s+/)
      .filter((r) => r.trim() !== "")
      .length : 0;

  const handleApply = () => {
    if (assignmentPreview.length === 0) {
      alert("No entries to paste or no empty cells available.");
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
        {totalEntries > 0 && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.75rem",
              backgroundColor: "#ecfdf5",
              borderRadius: "0.25rem",
              border: "1px solid #10b981",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <CheckCircle size={16} color="#059669" />
              <span
                style={{
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: "#059669",
                }}
              >
                {totalEntries} entries will be placed in {assignmentPreview.length} cell(s)
              </span>
            </div>
            <p
              style={{
                fontSize: "0.75rem",
                color: "#6b7280",
                marginTop: "0.25rem",
                marginLeft: "1rem",
              }}
            >
              Entries are placed in first available empty cells. Run "Check Errors" after pasting to validate.
            </p>
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
              Preview: Parsed entries:
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
                      Input
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
                      Player
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {assignmentPreview.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td
                        style={{
                          padding: "0.5rem",
                          fontFamily: "monospace",
                          color: "#1e40af",
                        }}
                      >
                        {item.resultString}
                      </td>
                      <td
                        style={{
                          padding: "0.5rem",
                          color: "#374151",
                        }}
                      >
                        <strong>{item.parsedPlayerRank}</strong>. {item.parsedPlayerName}
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
              Each result is placed in the first available empty round for the assigned player.
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
            disabled={totalEntries === 0 || assignmentPreview.length === 0}
            style={{
              padding: "0.75rem 1.5rem",
              background: totalEntries > 0 && assignmentPreview.length > 0 ? "#3b82f6" : "#9ca3af",
              border: "none",
              borderRadius: "0.25rem",
              cursor: totalEntries > 0 && assignmentPreview.length > 0 ? "pointer" : "not-allowed",
              fontSize: "0.875rem",
              color: "white",
            }}
          >
            Paste {totalEntries} Entry{totalEntries !== 1 ? 'ies' : ''}
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
          • Each entry is placed in ONE cell (not distributed to multiple players)
          <br />
          • Entries fill empty cells sequentially across all players
          <br />
          • No validation - run "Check Errors" after pasting
          <br />
          <strong>Examples:</strong>
          <br />
          • <code style={{ backgroundColor: "#e0f2fe", padding: "0.125rem 0.25rem", borderRadius: "0.125rem" }}>5W3 7L2 9D4</code> → fills 3 cells
          <br />
          • <code style={{ backgroundColor: "#e0f2fe", padding: "0.125rem 0.25rem", borderRadius: "0.125rem" }}>5W3\t7L2</code> → fills 2 cells
        </div>
      </div>
    </div>
  );
}
