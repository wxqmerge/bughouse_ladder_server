import type { PlayerData } from "../utils/hashUtils";

interface DeleteHiddenPlayerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSkip: () => void;
  player: PlayerData;
  remainingCount: number;
  processedCount: number;
}

export default function DeleteHiddenPlayerDialog({
  isOpen,
  onClose,
  onConfirm,
  onSkip,
  player,
  remainingCount,
  processedCount,
}: DeleteHiddenPlayerDialogProps) {
  if (!isOpen) return null;

  const filledCount = (player.gameResults || []).filter((r) => r && r.trim() !== "").length;

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
          maxWidth: "500px",
          width: "90%",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <h2 style={{ fontSize: "1.125rem", fontWeight: "600", color: "#374151", marginBottom: "1rem" }}>
          Delete Hidden Player
        </h2>

        <div style={{ marginBottom: "1rem", fontSize: "0.875rem", color: "#4b5563" }}>
          <p style={{ margin: "0 0 0.25rem 0" }}>
            <strong>Progress:</strong> {processedCount} of {remainingCount} hidden players reviewed
          </p>
        </div>

        <div style={{ marginBottom: "1rem", padding: "1rem", backgroundColor: "#fef3c7", borderRadius: "0.25rem", border: "1px solid #f59e0b" }}>
          <table style={{ width: "100%", fontSize: "0.875rem" }}>
            <tbody>
              <tr>
                <td style={{ padding: "0.25rem 0.5rem", fontWeight: 600, width: "100px" }}>Rank</td>
                <td style={{ padding: "0.25rem 0.5rem" }}>{player.rank}</td>
              </tr>
              <tr>
                <td style={{ padding: "0.25rem 0.5rem", fontWeight: 600 }}>Group</td>
                <td style={{ padding: "0.25rem 0.5rem" }}>{player.group || ""}</td>
              </tr>
              <tr>
                <td style={{ padding: "0.25rem 0.5rem", fontWeight: 600 }}>Name</td>
                <td style={{ padding: "0.25rem 0.5rem" }}>{player.firstName} {player.lastName}</td>
              </tr>
              <tr>
                <td style={{ padding: "0.25rem 0.5rem", fontWeight: 600 }}>Rating</td>
                <td style={{ padding: "0.25rem 0.5rem" }}>{player.rating || ""}</td>
              </tr>
              <tr>
                <td style={{ padding: "0.25rem 0.5rem", fontWeight: 600 }}>Grade</td>
                <td style={{ padding: "0.25rem 0.5rem" }}>{player.grade || ""}</td>
              </tr>
              <tr>
                <td style={{ padding: "0.25rem 0.5rem", fontWeight: 600 }}>School</td>
                <td style={{ padding: "0.25rem 0.5rem" }}>{player.school || ""}</td>
              </tr>
              <tr>
                <td style={{ padding: "0.25rem 0.5rem", fontWeight: 600 }}>Room</td>
                <td style={{ padding: "0.25rem 0.5rem" }}>{player.room || ""}</td>
              </tr>
              <tr>
                <td style={{ padding: "0.25rem 0.5rem", fontWeight: 600 }}>Games</td>
                <td style={{ padding: "0.25rem 0.5rem" }}>{player.num_games || player.attendance || 0}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {filledCount > 0 && (
          <details style={{ marginBottom: "1rem" }}>
            <summary style={{ fontSize: "0.875rem", fontWeight: "500", color: "#4b5563", cursor: "pointer", marginBottom: "0.5rem" }}>
              Game Results ({filledCount} filled)
            </summary>
            <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "0.25rem", padding: "0.5rem" }}>
              <div style={{ marginBottom: "0.5rem", fontSize: "0.75rem" }}>
                <strong style={{ marginRight: "0.5rem" }}>P{player.rank}</strong>
                <div style={{ overflowX: "auto", overflowY: "hidden", padding: "0.25rem 0" }}>
                  <span style={{ display: "inline-flex", gap: "0.25rem", whiteSpace: "nowrap" }}>
                    {(player.gameResults || []).map((result, rIdx) => {
                      if (!result || result.trim() === "") return null;
                      const hasUnderscore = result.endsWith("_");
                      const cleanResult = result.replace(/_+$/, "");
                      return (
                        <span key={rIdx} title={`Round ${rIdx + 1}${hasUnderscore ? " (saved)" : ""}`}>
                          <span style={{ color: "#9ca3af", marginRight: "0.125rem" }}>{rIdx + 1}</span>
                          <span
                            style={{
                              padding: "0.125rem 0.375rem",
                              backgroundColor: hasUnderscore ? "#d1fae5" : "#e0f2fe",
                              borderRadius: "0.125rem",
                              color: "#1f2937",
                            }}
                          >
                            {cleanResult}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                </div>
              </div>
            </div>
          </details>
        )}

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "0.5rem 1rem",
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
            onClick={onSkip}
            style={{
              padding: "0.5rem 1rem",
              background: "#f59e0b",
              border: "none",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.875rem",
              color: "white",
              fontWeight: "500",
            }}
          >
            Skip
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "0.5rem 1rem",
              background: "#ef4444",
              border: "none",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.875rem",
              color: "white",
              fontWeight: "500",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
