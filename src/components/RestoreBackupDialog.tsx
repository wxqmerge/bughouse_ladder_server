import { useState, useEffect, useRef } from "react";
import { AlertTriangle, Check, Trash2, Loader2 } from "lucide-react";
import { loadUserSettings } from "../services/userSettingsStorage";
import { gatedFetch } from "../utils/requestGate";
import { parseTabContent } from "../services/miniGameLocalStorage";

interface PlayerData {
  rank: number;
  group: string;
  lastName: string;
  firstName: string;
  rating: number;
  nRating: number;
  trophyEligible?: boolean;
  gameResults?: (string | null)[];
}

interface BackupFile {
  filename: string;
  date: string;
  timestamp: string;
  playerCount?: number;
  filledRounds?: number;
}

interface RestoreBackupDialogProps {
  onClose: () => void;
  onRestore: (filename: string) => void;
  ladderFile?: string;
}

export default function RestoreBackupDialog({
  onClose,
  onRestore,
  ladderFile,
}: RestoreBackupDialogProps) {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewPlayers, setPreviewPlayers] = useState<Record<string, PlayerData[]>>({});
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({});
  const loadingRef = useRef(false);

  useEffect(() => {
    loadBackups();
  }, []);

  const loadBackupPreview = async (filename: string) => {
    if (previewPlayers[filename]) return;

    setPreviewLoading(prev => ({ ...prev, [filename]: true }));
    try {
      const userSettings = loadUserSettings();
      const serverUrl = (userSettings.server || "").trim();

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userSettings.apiKey?.trim()) {
        headers['X-API-Key'] = userSettings.apiKey.trim();
      }
      const response = await gatedFetch(`${serverUrl}/api/admin/backups/preview/${encodeURIComponent(filename)}`, {
        headers,
      });

      if (!response.ok) return;

      const data = await response.json();
      const content = data.data?.content;
      if (content) {
        const parsed = parseTabContent(content);
        setPreviewPlayers(prev => ({ ...prev, [filename]: parsed.players }));
      }
    } catch (err) {
      console.error("Failed to load backup preview:", err);
    } finally {
      setPreviewLoading(prev => ({ ...prev, [filename]: false }));
    }
  };

  const loadBackups = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      setLoading(true);
      setError(null);
      const userSettings = loadUserSettings();
      const serverUrl = (userSettings.server || "").trim();
      
      if (!serverUrl) {
        setError("No server configured");
        return;
      }

      const ladderPrefix = ladderFile ? ladderFile.replace('.tab', '') : undefined;
      const ladderParam = ladderPrefix ? `?ladder=${encodeURIComponent(ladderPrefix)}` : '';
      console.log('[RESTORE BACKUP] ladderFile:', ladderFile, 'ladderPrefix:', ladderPrefix, 'ladderParam:', ladderParam);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userSettings.apiKey?.trim()) {
        headers['X-API-Key'] = userSettings.apiKey.trim();
      }
      const response = await gatedFetch(`${serverUrl}/api/admin/backups${ladderParam}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('[RESTORE BACKUP] server response:', JSON.stringify(data));
      const backupsList = data.data?.backups || [];
      console.log('[RESTORE BACKUP] backupsList:', backupsList.length, backupsList.map((b: any) => b.filename));
      setBackups(backupsList);

      // Load preview for each backup
      for (const backup of backupsList) {
        await loadBackupPreview(backup.filename);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load backups");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const handleRestore = async (filename: string) => {
    setRestoring(filename);
    try {
      await onRestore(filename);
    } finally {
      setRestoring(null);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!window.confirm(`Delete backup ${filename}?`)) {
      return;
    }

    setDeleting(filename);
    try {
      const userSettings = loadUserSettings();
      const serverUrl = (userSettings.server || "").trim();

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userSettings.apiKey?.trim()) {
        headers['X-API-Key'] = userSettings.apiKey.trim();
      }
      const response = await gatedFetch(`${serverUrl}/api/admin/backups/${filename}`, {
        method: "DELETE",
        headers,
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
          maxWidth: "900px",
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
                  <th style={{ padding: "0.5rem", textAlign: "center", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>Actions</th>
                  <th style={{ padding: "0.5rem", textAlign: "center", borderBottom: "1px solid #e5e7eb", fontWeight: 600, width: "60px" }}>Players</th>
                  <th style={{ padding: "0.5rem", textAlign: "center", borderBottom: "1px solid #e5e7eb", fontWeight: 600, width: "200px" }}>Game Results</th>
                  <th style={{ padding: "0.5rem", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>Timestamp</th>
                  <th style={{ padding: "0.5rem", textAlign: "right", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>Backup</th>
                </tr>
              </thead>
              <tbody>
                 {backups.map((backup) => (
                   <tr
                     key={backup.filename}
                     style={{
                       borderTop: "1px solid #f3f4f6",
                       cursor: "pointer",
                       transition: "background-color 0.15s",
                     }}
                     onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f0fdf4")}
                     onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                     onClick={() => handleRestore(backup.filename)}
                   >
                     <td style={{ padding: "0.5rem", textAlign: "center" }}>
                       <div style={{ display: "flex", gap: "0.25rem", justifyContent: "center" }}>
                         <button
                           onClick={(e) => { e.stopPropagation(); handleRestore(backup.filename); }}
                           disabled={restoring !== null || deleting !== null}
                           style={{
                             padding: "0.375rem 0.75rem",
                             backgroundColor: restoring === backup.filename ? "#bbf7d0" : "#16a34a",
                             border: "1px solid #16a34a",
                             borderRadius: "0.25rem",
                             cursor: restoring === backup.filename ? "not-allowed" : "pointer",
                             fontSize: "0.75rem",
                             fontWeight: 600,
                             color: "white",
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
                           onClick={(e) => { e.stopPropagation(); handleDelete(backup.filename); }}
                           disabled={restoring !== null || deleting !== null}
                           style={{
                             padding: "0.375rem 0.75rem",
                             backgroundColor: deleting === backup.filename ? "#fecaca" : "#dc2626",
                             border: "1px solid #dc2626",
                             borderRadius: "0.25rem",
                             cursor: deleting === backup.filename ? "not-allowed" : "pointer",
                             fontSize: "0.75rem",
                             fontWeight: 600,
                             color: "white",
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
                     <td style={{ padding: "0.5rem", textAlign: "center", fontWeight: 600, color: "#374151" }}>
                       {previewPlayers[backup.filename]?.length ?? (previewLoading[backup.filename] ? '-' : '-')}
                     </td>
                     <td style={{ padding: "0.5rem", textAlign: "center" }}>
                       {previewLoading[backup.filename] ? (
                         <Loader2 size={14} style={{ animation: "spin 1s linear infinite", display: "inline-block" }} />
                       ) : previewPlayers[backup.filename] && previewPlayers[backup.filename].length > 0 ? (
                         <div style={{ maxHeight: "60px", overflowX: "auto", overflowY: "hidden" }}>
                           {previewPlayers[backup.filename].filter((p) => (p.gameResults || []).some((r) => r && r.trim() !== "")).slice(0, 3).map((p) => (
                             <div key={p.rank} style={{ fontSize: "0.7rem", marginBottom: "0.125rem" }}>
                               <span style={{ color: "#6b7280", marginRight: "0.25rem" }}>P{p.rank}</span>
                               <span style={{ display: "inline-flex", gap: "0.125rem", whiteSpace: "nowrap" }}>
                                 {(p.gameResults || []).map((result, roundIdx) =>
                                    result && result.trim() !== "" ? (
                                      <span key={roundIdx} style={{
                                        padding: "0 0.25rem",
                                        backgroundColor: "#e0f2fe",
                                        borderRadius: "0.125rem",
                                        fontSize: "0.65rem",
                                      }}>
                                        {(result || "").replace(/_+$/, "")}
                                      </span>
                                    ) : null
                                  )}
                               </span>
                             </div>
                           ))}
                           {previewPlayers[backup.filename].some((p) => (p.gameResults || []).some((r) => r && r.trim() !== "")) && (
                             <div style={{ fontSize: "0.65rem", color: "#9ca3af" }}>
                               +{previewPlayers[backup.filename].filter(p => (p.gameResults || []).some(r => r && r.trim() !== '')).length - 3} more
                             </div>
                           )}
                         </div>
                       ) : (
                         <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>No results</span>
                       )}
                     </td>
                      <td style={{ padding: "0.5rem", color: "#6b7280" }}>{formatDate(backup.timestamp)}</td>
                      <td style={{ padding: "0.5rem", fontWeight: 600, color: "#16a34a", textAlign: "right" }}>{backup.filename}</td>
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
