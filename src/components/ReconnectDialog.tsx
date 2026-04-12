import { Wifi, WifiOff, RefreshCw } from "lucide-react";

// Add pulse animation style
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;
document.head.appendChild(style);

interface ReconnectDialogProps {
  wasServerMode: boolean;
  isNowConnected: boolean;
  onDismiss: () => void;
}

export function ReconnectDialog({
  wasServerMode,
  isNowConnected,
  onDismiss,
}: ReconnectDialogProps) {
  const isReconnect = wasServerMode && isNowConnected;
  const isDisconnect = wasServerMode && !isNowConnected;
  
  if (!isReconnect && !isDisconnect) return null;

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
          maxWidth: "450px",
          width: "90%",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "1rem",
          }}
        >
          {isReconnect ? (
            <Wifi
              size={48}
              color="#10b981"
              style={{ animation: "pulse 2s ease-in-out infinite" }}
            />
          ) : (
            <WifiOff size={48} color="#ef4444" />
          )}
        </div>

        <h2
          style={{
            fontSize: "1.25rem",
            fontWeight: "600",
            marginBottom: "0.75rem",
            color: isReconnect ? "#059669" : "#dc2626",
          }}
        >
          {isReconnect
            ? "Server Reconnected!"
            : "Server Connection Lost"}
        </h2>

        <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1.5rem" }}>
          {isReconnect
            ? "The application has reconnected to the server. Your data will now sync automatically."
            : "The server is currently unreachable. The application is now running in local mode. Changes will be saved locally and synced when the server becomes available again."}
        </p>

        <div
          style={{
            padding: "0.75rem",
            backgroundColor: isReconnect ? "#ecfdf5" : "#fef2f2",
            borderRadius: "0.25rem",
            border: `1px solid ${isReconnect ? "#10b981" : "#ef4444"}`,
            marginBottom: "1.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              fontSize: "0.875rem",
              color: isReconnect ? "#047857" : "#991b1b",
            }}
          >
            <RefreshCw size={16} />
            <span>
              {isReconnect
                ? "Auto-retry is active (every 10 seconds)"
                : "Will automatically retry connection every 10 seconds"}
            </span>
          </div>
        </div>

        <button
          onClick={onDismiss}
          style={{
            padding: "0.75rem 2rem",
            background: isReconnect ? "#10b981" : "#ef4444",
            border: "none",
            borderRadius: "0.25rem",
            cursor: "pointer",
            fontSize: "0.875rem",
            fontWeight: "600",
            color: "white",
          }}
        >
          {isReconnect ? "Great!" : "Continue in Local Mode"}
        </button>
      </div>
    </div>
  );
}
