import { Wifi, WifiOff, RefreshCw, AlertTriangle, Download, Upload } from "lucide-react";

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
  hasLocalChanges: boolean;
  onDismiss: () => void;
  onPullFromServer: () => void;
  onPushToServer: () => void;
}

export function ReconnectDialog({
  wasServerMode,
  isNowConnected,
  hasLocalChanges,
  onDismiss,
  onPullFromServer,
  onPushToServer,
}: ReconnectDialogProps) {
  const isReconnect = wasServerMode && isNowConnected;
  const isDisconnect = wasServerMode && !isNowConnected;
  const showConflictResolution = isReconnect && hasLocalChanges;
  
  if (!isReconnect && !isDisconnect) return null;

  // Conflict resolution dialog (reconnect with local changes)
  if (showConflictResolution) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10000,
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "0.75rem",
            padding: "2rem",
            maxWidth: "500px",
            width: "90%",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                backgroundColor: "#fef3c7",
                borderRadius: "50%",
                padding: "0.5rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertTriangle size={28} color="#f59e0b" />
            </div>
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: "700",
                color: "#1f2937",
                margin: 0,
              }}
            >
              Server Connection Restored
            </h2>
          </div>

          <div
            style={{
              marginBottom: "1.5rem",
              padding: "1rem",
              backgroundColor: "#fffbeb",
              borderLeft: "4px solid #f59e0b",
              borderRadius: "0.25rem",
            }}
          >
            <p style={{ fontSize: "0.95rem", color: "#92400e", margin: 0, lineHeight: "1.5" }}>
              You made changes while the server was unavailable. The server is now back online.
              How would you like to resolve this?
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* Pull from Server Option */}
            <button
              onClick={onPullFromServer}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "1rem",
                backgroundColor: "#dbeafe",
                border: "2px solid #3b82f6",
                borderRadius: "0.5rem",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#bfdbfe";
                e.currentTarget.style.transform = "translateX(4px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#dbeafe";
                e.currentTarget.style.transform = "translateX(0)";
              }}
            >
              <Download size={20} color="#2563eb" />
              <div>
                <div style={{ fontWeight: "600", color: "#1e40af", fontSize: "0.95rem" }}>
                  Pull from Server
                </div>
                <div style={{ fontSize: "0.8rem", color: "#1e40af", marginTop: "0.25rem" }}>
                  Discard local changes and download latest data from server
                </div>
              </div>
            </button>

            {/* Push to Server Option */}
            <button
              onClick={onPushToServer}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "1rem",
                backgroundColor: "#d1fae5",
                border: "2px solid #10b981",
                borderRadius: "0.5rem",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#a7f3d0";
                e.currentTarget.style.transform = "translateX(4px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#d1fae5";
                e.currentTarget.style.transform = "translateX(0)";
              }}
            >
              <Upload size={20} color="#059669" />
              <div>
                <div style={{ fontWeight: "600", color: "#065f46", fontSize: "0.95rem" }}>
                  Push to Server
                </div>
                <div style={{ fontSize: "0.8rem", color: "#065f46", marginTop: "0.25rem" }}>
                  Upload local changes and overwrite server data
                </div>
              </div>
            </button>
          </div>

          <div
            style={{
              marginTop: "1rem",
              padding: "0.75rem",
              backgroundColor: "#f0f9ff",
              borderRadius: "0.25rem",
              fontSize: "0.8rem",
              color: "#0369a1",
            }}
          >
            <strong>Note:</strong> Choosing "Pull" will permanently delete your local changes.
            Choosing "Push" will overwrite the server data with your local version.
          </div>
        </div>
      </div>
    );
  }

  // Simple reconnect/disconnect notification
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
