import { useState, useEffect } from "react";
import { AlertTriangle, Check, Trash2, Loader2 } from "lucide-react";

interface BackupFile {
  filename: string;
  size: number;
  modified: string;
}

interface RestoreBackupDialogProps {
  onClose: () => void;
  onRestore: (filename: string) => void;
}

export default function RestoreBackupDialog({
  onClose,
  onRestore,
}: RestoreBackupDialogProps) {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackups = async () => {
    try {
      setLoading(true);
      setError(null);
      const userSettings = JSON.parse(localStorage.getItem("bughouse-ladder-user-settings") || "{}");
      const serverUrl = (userSettings.server || "").trim();
      
      if (!serverUrl) {
        setError("No server configured");
        return;
      }

      const response = await fetch(`${serverUrl}/api/admin/backups`, {
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setBackups(data.data?.backups || []);
    } catch (err: any) {
      setError(err.message || "Failed to load backups");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (filename: string) => {
    if (!window.confirm(`Restore from backup?\n\nThis will replace current data with ${filename}`)) {
      return;
    }

    setRestoring(filename);
    try {
      const userSettings = JSON.parse(localStorage.getItem("bughouse-ladder-user-settings") || "{}");
      const serverUrl = (userSettings.server || "").trim();

      const response = await fetch(`${serverUrl}/api/admin/backups/restore/${filename}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        onRestore(filename);
      } else {
        setError(data.error?.message || "Restore failed");
        setRestoring(null);
      }
    } catch (err: any) {
      setError(err.message || "Restore failed");
      setRestoring(null);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`Delete backup ${filename}?`)) {
      return;
    }

    setDeleting(filename);
    try {
      const userSettings = JSON.parse(localStorage.getItem("bughouse-ladder-user-settings") || "{}");
      const serverUrl = (userSettings.server || "").trim();

      const response = await fetch(`${serverUrl}/api/admin/backups/${filename}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      setBackups(prev => prev.filter(b => b.filename !== filename));
    } catch (err: any) {
      setError(err.message || "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString();
    } catch {
      return dateStr;
    }
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
          maxWidth: "600px",
          width: "90%",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <AlertTriangle size={20} style={{ color: "#f59e0b" }} />
          <h2 style={{ fontSize: "1.125rem", fontWeight: "600", color: "#374151", margin: 0 }}>
            Restore Backup
          </h2>
        </div>

        <p style={{ fontSize: "0.875rem", color: "#4b5563", marginBottom: "1rem" }}>
          Select a backup file to restore. This will replace all current data with the selected backup.
        </p>

        {error && (
          <div
            style={{
              padding: "0.75rem",
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "0.25rem",
              color: "#dc2626",
              fontSize: "0.875rem",
              marginBottom: "1rem",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", marginBottom: "1rem" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
              <Loader2 size={24} className="animate-spin" style={{ display: "inline-block" }} />
              <p>Loading backups...</p>
            </div>
          ) : backups.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}>
              <p>No backups found</p>
              <button
                onClick={loadBackups}
                style={{
                  marginTop: "0.5rem",
                  padding: "0.5rem 1rem",
                  backgroundColor: "#f3f4f6",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  cursor: "pointer",
                  fontSize: "0.875rem",
                }}
              >
                Refresh
              </button>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ backgroundColor: "#f9fafb" }}>
                  <th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>Backup</th>
                  <th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>Date</th>
                  <th style={{ padding: "0.5rem", textAlign: "center", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>Size</th>
                  <th style={{ padding: "0.5rem", textAlign: "center", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => (
                  <tr key={backup.filename} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "0.5rem" }}>{backup.filename}</td>
                    <td style={{ padding: "0.5rem", color: "#6b7280" }}>{formatDate(backup.modified)}</td>
                    <td style={{ padding: "0.5rem", textAlign: "center", color: "#6b7280" }}>{formatSize(backup.size)}</td>
                    <td style={{ padding: "0.5rem", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: "0.25rem", justifyContent: "center" }}>
                        <button
                          onClick={() => handleRestore(backup.filename)}
                          disabled={restoring !== null || deleting !== null}
                          style={{
                            padding: "0.375rem 0.75rem",
                            backgroundColor: "#f0fdf4",
                            border: "1px solid #86efac",
                            borderRadius: "0.25rem",
                            cursor: restoring === backup.filename ? "not-allowed" : "pointer",
                            fontSize: "0.75rem",
                            color: "#16a34a",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                        >
                          {restoring === backup.filename ? (
                            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                          ) : (
                            <Check size={14} />
                          )}
                          Restore
                        </button>
                        <button
                          onClick={() => handleDelete(backup.filename)}
                          disabled={restoring !== null || deleting !== null}
                          style={{
                            padding: "0.375rem 0.75rem",
                            backgroundColor: "#fef2f2",
                            border: "1px solid #fecaca",
                            borderRadius: "0.25rem",
                            cursor: deleting === backup.filename ? "not-allowed" : "pointer",
                            fontSize: "0.75rem",
                            color: "#dc2626",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                        >
                          {deleting === backup.filename ? (
                            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                          ) : (
                            <Trash2 size={14} />
                          )}
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#f3f4f6",
              border: "1px solid #d1d5db",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.875rem",
              color: "#374151",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
