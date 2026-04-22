import type { PlayerData } from "../utils/hashUtils";

interface InfoItem {
  label: string;
  value: string | number;
}

interface PreviewDialogProps {
  title: string;
  players: PlayerData[];
  extraInfo?: InfoItem[];
  cancelLabel?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function PreviewDialog({
  title,
  players,
  extraInfo = [],
  cancelLabel = "Cancel",
  confirmLabel,
  onCancel,
  onConfirm,
}: PreviewDialogProps) {
  const filledCount = players.reduce(
    (sum, p) => sum + (p.gameResults || []).filter((r) => r && r.trim() !== "").length,
    0
  );

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
          maxWidth: "400px",
          width: "90%",
        }}
      >
        <h2 style={{ fontSize: "1.125rem", fontWeight: "600", color: "#374151", marginBottom: "1rem" }}>
          {title}
        </h2>

        {extraInfo.length > 0 && (
          <div style={{ marginBottom: "1rem", fontSize: "0.875rem", color: "#4b5563" }}>
            {extraInfo.map((item) => (
              <p key={item.label} style={{ margin: "0 0 0.5rem 0" }}>
                <strong>{item.label}:</strong> {item.value}
              </p>
            ))}
          </div>
        )}

        <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "0.25rem", marginBottom: "1rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ backgroundColor: "#f9fafb", position: "sticky", top: 0, zIndex: 1 }}>
                <th style={{ padding: "0.375rem 0.5rem", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>Rank</th>
                <th style={{ padding: "0.375rem 0.5rem", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>Group</th>
                <th style={{ padding: "0.375rem 0.5rem", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>Last Name</th>
                <th style={{ padding: "0.375rem 0.5rem", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>First Name</th>
                <th style={{ padding: "0.375rem 0.5rem", textAlign: "center", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>Rating</th>
                <th style={{ padding: "0.375rem 0.5rem", textAlign: "center", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>Games</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, idx) => (
                <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? "transparent" : "#f9fafb" }}>
                  <td style={{ padding: "0.375rem 0.5rem", borderBottom: "1px solid #f3f4f6", textAlign: "center" }}>{p.rank}</td>
                  <td style={{ padding: "0.375rem 0.5rem", borderBottom: "1px solid #f3f4f6" }}>{p.group || ""}</td>
                  <td style={{ padding: "0.375rem 0.5rem", borderBottom: "1px solid #f3f4f6" }}>{p.lastName || ""}</td>
                  <td style={{ padding: "0.375rem 0.5rem", borderBottom: "1px solid #f3f4f6" }}>{p.firstName || ""}</td>
                  <td style={{ padding: "0.375rem 0.5rem", borderBottom: "1px solid #f3f4f6", textAlign: "center" }}>{p.rating || ""}</td>
                  <td style={{ padding: "0.375rem 0.5rem", borderBottom: "1px solid #f3f4f6", textAlign: "center" }}>{p.num_games || p.attendance || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filledCount > 0 && (
          <details style={{ marginBottom: "1rem" }}>
            <summary style={{ fontSize: "0.875rem", fontWeight: "500", color: "#4b5563", cursor: "pointer", marginBottom: "0.5rem" }}>
              Game Results ({filledCount} filled)
            </summary>
            <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "0.25rem", padding: "0.5rem" }}>
              {players.filter((p) => (p.gameResults || []).some((r) => r && r.trim() !== "")).map((p, idx) => (
                <div key={idx} style={{ marginBottom: "0.5rem", fontSize: "0.75rem" }}>
                  <strong style={{ marginRight: "0.5rem" }}>P{p.rank}</strong>
                  <div style={{ overflowX: "auto", overflowY: "hidden", padding: "0.25rem 0" }}>
                    <span style={{ display: "inline-flex", gap: "0.25rem", whiteSpace: "nowrap" }}>
                      {(p.gameResults || []).map((result, rIdx) => {
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
              ))}
            </div>
          </details>
        )}

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
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
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "0.5rem 1rem",
              background: "#10b981",
              border: "none",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.875rem",
              color: "white",
              fontWeight: "500",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
