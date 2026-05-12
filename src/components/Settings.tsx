/**
 * VB6 Bughouse Ladder - Settings Component
 * Translated from Settings.frm - Configuration dialog
 */

import { useState, useEffect } from "react";
import {
  X,
  Settings as SettingsIcon,
  Trash2,
  RotateCcw,
  CalendarDays,
  Eye,
  Server,
  Key,
} from "lucide-react";
import "../css/index.css";
import { getSettings, saveSettings } from "../services/storageService";
import { loadUserSettings, saveUserSettings, normalizeServerUrl, getLastWorkingConfig, type UserSettings } from "../services/userSettingsStorage";

interface SettingsProps {
  onClose: () => void;
  onReset: () => void;
  onClearAll: () => void;
  onNewDay: () => void;
  onNewDayWithReRank: () => void;
  onWalkThroughReports?: () => void;
  onClearMiniGames?: () => void;
  onExportTournamentFiles?: () => void;
  onImportTournamentFiles?: () => void;
  onGenerateTrophies?: () => void;
  isTournamentActive?: boolean;
  isAdmin: boolean;
}

export default function Settings({
  onClose,
  onReset,
  onClearAll,
  onNewDay,
  onNewDayWithReRank,
  onWalkThroughReports,
  onClearMiniGames,
  onExportTournamentFiles,
  onImportTournamentFiles,
  onGenerateTrophies,
  isTournamentActive,
  isAdmin,
}: SettingsProps) {
  const [showRatings, setShowRatings] = useState(true);
  const [debugLevel, setDebugLevel] = useState(5);
  const [kFactor, setKFactor] = useState(20);
  // Server settings state
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [debugMode, setDebugMode] = useState(false);
  const [lastWorkingConfig, setLastWorkingConfig] = useState<{ server: string; apiKey: string } | null>(null);

  useEffect(() => {
    const savedSettings = getSettings();
    if (savedSettings) {
      try {
        setShowRatings(savedSettings.showRatings ?? true);
        setDebugLevel(savedSettings.debugLevel ?? 5);
        setKFactor(savedSettings.kFactor ?? 20);
      } catch (err) {
        console.error("Failed to parse settings:", err);
      }
    }
    
    // Load user server settings
    const userSettings = loadUserSettings();
    setServerUrl(normalizeServerUrl(userSettings.server) || '');
    setApiKey(userSettings.apiKey || '');
    setDebugMode(userSettings.debugMode || false);
    
    const lwc = getLastWorkingConfig();
    if (lwc) {
      setLastWorkingConfig({ ...lwc });
    }
  }, []);

  const handleSave = () => {
    console.log(">>> [BUTTON PRESSED] Save (Settings)");
    if (isAdmin) {
      const settings = {
        showRatings: [showRatings, showRatings, showRatings, showRatings],
        debugLevel: debugLevel,
        kFactor: Math.max(1, Math.min(100, kFactor || 20)),
      };
      saveSettings(settings);
    }

    // Save user server settings
    const userSettings: UserSettings = {
      server: serverUrl.trim(),
      apiKey: apiKey.trim(),
      debugMode: debugMode,
    };
    saveUserSettings(userSettings);
    
    onClose();
    
    // Show confirmation with current mode
    const mode = userSettings.server && userSettings.server.trim()
      ? `Server mode: ${userSettings.server}`
      : 'Local mode';
    alert(`Settings saved successfully!\n\n${mode}`);
    
    // Reload to apply server configuration changes
    setTimeout(() => {
      console.log('[Settings] Reloading to apply server configuration...');
      window.location.reload();
    }, 500);
  };

  const handleClearAll = () => {
    console.log(">>> [BUTTON PRESSED] Set Sample Data");
    if (
      window.confirm(
        "Are you sure you want to reset all data to sample data? This will clear all loaded players and game results.",
      )
    ) {
      onReset();
      onClose();
    }
  };

  const handleClearData = () => {
    console.log(">>> [BUTTON PRESSED] Clear All");
    if (
      window.confirm(
        "Are you sure you want to clear all data? This will leave the grid blank.",
      )
    ) {
      onClearAll();
      onClose();
    }
  };

  const handleNewDay = () => {
    console.log(">>> [BUTTON PRESSED] New Day");
    if (
      window.confirm(
        "Are you sure you want to start a new day? This will copy New Rating to Previous Rating and clear reports.",
      )
    ) {
      onNewDay();
      onClose();
    }
  };

  const handleNewDayWithReRank = () => {
    console.log(">>> [BUTTON PRESSED] New Day with Re-rank");
    if (
      window.confirm(
        "Are you sure you want to start a new day with re-ranking? This will copy New Rating to Previous Rating, clear reports, and sort players by rating.",
      )
    ) {
      onNewDayWithReRank();
      onClose();
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
          backgroundColor: "var(--surface-color)",
          padding: "2rem",
          borderRadius: "0.5rem",
          maxWidth: "600px",
          width: "90%",
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "2rem",
          }}
        >
          <h2>
            <SettingsIcon size={24} style={{ marginRight: "0.5rem" }} />
            Settings
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <X size={24} />
          </button>
        </div>

       {isAdmin && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "2rem",
            }}
          >
            {/* Left Column - Configuration */}
          <div>
            <h3
              style={{
                fontSize: "0.875rem",
                fontWeight: "600",
                color: "#374151",
                marginBottom: "1rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Configuration
            </h3>

            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <input
                  type="checkbox"
                  checked={showRatings}
                  onChange={(e) => setShowRatings(e.target.checked)}
                />
                <span>Show ratings</span>
              </label>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#64748b",
                  marginTop: "0.25rem",
                  paddingLeft: "1.5rem",
                }}
              >
                A1-A8, I1-I8, Z1-Z8 groups
              </p>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label
                htmlFor="debugLevel"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                Debug Level
              </label>
              <input
                type="number"
                id="debugLevel"
                min="0"
                max="20"
                value={debugLevel}
                onChange={(e) =>
                  setDebugLevel(
                    Math.max(0, Math.min(20, parseInt(e.target.value) || 5)),
                  )
                }
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
              />
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#6b7280",
                  marginTop: "0.25rem",
                }}
              >
                0=all logs, 5=default, 10+=critical
              </p>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label
                htmlFor="kFactor"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                K-Factor (Elo volatility)
              </label>
              <input
                type="number"
                id="kFactor"
                min="1"
                max="100"
                value={kFactor}
                onChange={(e) =>
                  setKFactor(
                    Math.max(1, Math.min(100, parseInt(e.target.value) || 20)),
                  )
                }
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
              />
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#6b7280",
                  marginTop: "0.25rem",
                }}
              >
                Higher = faster rating changes (1-100)
              </p>
            </div>

          </div>

          {/* Right Column - Actions */}
          <div>
            <h3
              style={{
                fontSize: "0.875rem",
                fontWeight: "600",
                color: "#374151",
                marginBottom: "1rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Actions
            </h3>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              {isAdmin && !isTournamentActive && (
                <>
                  <button
                    onClick={handleNewDay}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      padding: "0.75rem",
                      backgroundColor: "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      fontWeight: "500",
                    }}
                  >
                    <CalendarDays size={16} />
                    New Day
                  </button>

                  <button
                    onClick={handleNewDayWithReRank}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      padding: "0.75rem",
                      backgroundColor: "#10b981",
                      color: "white",
                      border: "none",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      fontWeight: "500",
                    }}
                  >
                    <CalendarDays size={16} />
                    New Day + Re-rank
                  </button>
                </>
              )}

              {isAdmin && (
                <>
                  {onClearMiniGames && (
                    <button
                      onClick={() => {
                        if (window.confirm("Clear all mini-game files? This will remove all 7 mini-game .tab files and end tournament mode.")) {
                          onClearMiniGames();
                        }
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        padding: "0.75rem",
                        backgroundColor: "#dc2626",
                        color: "white",
                        border: "none",
                        borderRadius: "0.25rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        fontWeight: "500",
                      }}
                    >
                      <Trash2 size={16} />
                      Clear Mini-Games
                    </button>
                  )}

                  {isTournamentActive && onExportTournamentFiles && (
                    <button
                      onClick={() => {
                        onClose();
                        onExportTournamentFiles();
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        padding: "0.75rem",
                        backgroundColor: "#0ea5e9",
                        color: "white",
                        border: "none",
                        borderRadius: "0.25rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        fontWeight: "500",
                      }}
                    >
                      <CalendarDays size={16} />
                      Export Tournament Files
                    </button>
                  )}

                  {!isTournamentActive && onImportTournamentFiles && (
                    <button
                      onClick={() => {
                        onClose();
                        onImportTournamentFiles();
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        padding: "0.75rem",
                        backgroundColor: "#7c3aed",
                        color: "white",
                        border: "none",
                        borderRadius: "0.25rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        fontWeight: "500",
                      }}
                    >
                      <CalendarDays size={16} />
                      Import Tournament Files
                    </button>
                  )}

                  {onGenerateTrophies && (
                    <button
                      onClick={() => {
                        onClose();
                        onGenerateTrophies();
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        padding: "0.75rem",
                        backgroundColor: "#f97316",
                        color: "white",
                        border: "none",
                        borderRadius: "0.25rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        fontWeight: "500",
                      }}
                    >
                      <CalendarDays size={16} />
                      Generate Trophies
                    </button>
                  )}

                  {onWalkThroughReports && (
                    <button
                      onClick={() => {
                        onClose();
                        onWalkThroughReports();
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                        padding: "0.75rem",
                        backgroundColor: "#f59e0b",
                        color: "white",
                        border: "none",
                        borderRadius: "0.25rem",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        fontWeight: "500",
                      }}
                    >
                      <Eye size={16} />
                      Walk Through Reports
                    </button>
                  )}

                  <button
                    onClick={handleClearData}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      padding: "0.75rem",
                      backgroundColor: "#9ca3af",
                      color: "white",
                      border: "none",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      fontWeight: "500",
                    }}
                  >
                    <RotateCcw size={16} />
                    Clear All
                  </button>

                  <button
                    onClick={handleClearAll}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                      padding: "0.75rem",
                      backgroundColor: "#ef4444",
                      color: "white",
                      border: "none",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      fontWeight: "500",
                    }}
                  >
                    <Trash2 size={16} />
                    Set Sample Data
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        )}

        {/* Server Connection Section */}
        <div
          style={{
            backgroundColor: '#f8fafc',
            padding: '1.5rem',
            borderRadius: '0.5rem',
            marginTop: '2rem',
            border: '1px solid #e2e8f0',
          }}
        >
          <h3
            style={{
              fontSize: "0.875rem",
              fontWeight: "600",
              color: "#374151",
              marginBottom: "1rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <Server size={16} />
            Server Connection
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              {lastWorkingConfig && (
                <button
                  onClick={() => {
                    setServerUrl(lastWorkingConfig.server);
                    setApiKey(lastWorkingConfig.apiKey);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.375rem",
                    padding: "0.375rem 0.75rem",
                    backgroundColor: "#e0f2fe",
                    color: "#0369a1",
                    border: "1px solid #bae6fd",
                    borderRadius: "0.375rem",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    fontWeight: "500",
                    marginBottom: "0.5rem",
                  }}
                >
                  <RotateCcw size={12} />
                  Restore Last Server Config
                </button>
              )}
              <label
                htmlFor="serverUrl"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                Server URL
              </label>
              <input
                type="text"
                id="serverUrl"
                value={serverUrl}
                onChange={(e) => setServerUrl(normalizeServerUrl(e.target.value))}
                placeholder="http://omen.com:3000 or omen.com:3000"
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
              />
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#64748b",
                  marginTop: "0.25rem",
                }}
              >
                Leave empty for local mode (no server)
              </p>
            </div>
            
            <div>
              <label
                htmlFor="apiKey"
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  color: "#374151",
                  marginBottom: "0.5rem",
                }}
              >
                API Key
              </label>
              <input
                type="password"
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Your API key (optional)"
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.25rem",
                  fontSize: "0.875rem",
                  boxSizing: "border-box",
                }}
              />
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#64748b",
                  marginTop: "0.25rem",
                }}
              >
                Required if server has admin protection enabled
              </p>
            </div>
          </div>
          
          {/* Debug Mode Checkbox */}
          <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.875rem",
                color: "#6b7280",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={debugMode}
                onChange={(e) => setDebugMode(e.target.checked)}
                style={{
                  width: "16px",
                  height: "16px",
                  cursor: "pointer",
                }}
              />
              <span>Debug mode (show extra info in dialogs)</span>
            </label>
          </div>
        </div>

        <div style={{ display: "flex", gap: "1rem", marginTop: "2rem" }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
