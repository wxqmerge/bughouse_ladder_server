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
  BarChart3,
  Shield,
} from "lucide-react";
import "../css/index.css";
import { getSettings, saveSettings } from "../services/storageService";
import { loadUserSettings, saveUserSettings, normalizeServerUrl, getLastWorkingConfig, type UserSettings } from "../services/userSettingsStorage";
import { debugClick, debugInput } from "../utils/debug";
import { useTooltips } from "../hooks/useTooltips";

interface ActionSettings {
  showRatings: boolean[];
  debugLevel: number;
  kFactor: number;
}

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
  onImportSingleMiniGame?: () => void;
  onGenerateTrophies?: () => void;
  onGenerateActivityReport?: () => void;
  miniGamesHaveResults?: boolean;
  isAdmin: boolean;
  onToggleAdmin?: () => Promise<void>;
  onSaveBeforeAction?: (settings: ActionSettings, userSettings: UserSettings) => void;
  testMode: boolean;
  setTestMode: (value: boolean) => void;
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
  onImportSingleMiniGame,
  onGenerateTrophies,
  onGenerateActivityReport,
  miniGamesHaveResults,
  isAdmin,
  onToggleAdmin,
  onSaveBeforeAction,
  testMode,
  setTestMode,
}: SettingsProps) {
  const { title: tt, enabled: tooltipsEnabled, toggle: setTooltipsEnabled } = useTooltips();
  const [showRatings, setShowRatings] = useState(true);
  const [debugLevel, setDebugLevel] = useState(5);
  const [kFactor, setKFactor] = useState(20);
  // Server settings state
  const [serverUrl, setServerUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [lastWorkingConfig, setLastWorkingConfig] = useState<{ server: string; apiKey: string } | null>(null);
  const [adminToggleLoading, setAdminToggleLoading] = useState(false);
  const hasAdminKey = !!loadUserSettings().apiKey?.trim();

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
    const detectedOrigin = window.location.origin;
    setServerUrl(normalizeServerUrl(userSettings.server) || detectedOrigin);
    setApiKey(userSettings.apiKey || '');
    
    const lwc = getLastWorkingConfig();
    if (lwc) {
      setLastWorkingConfig({ ...lwc });
    }
  }, []);

  const handleSave = () => {
    debugClick("Settings:Save");
    console.debug(">>> [BUTTON PRESSED] Save (Settings)");
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
    };
    saveUserSettings(userSettings);
    
    // Show confirmation with current mode
    const mode = userSettings.server && userSettings.server.trim()
      ? `Server mode: ${userSettings.server}`
      : 'Local mode';
    alert(`Settings saved successfully!\n\n${mode}`);
    
    // Reload to apply server configuration changes
    setTimeout(() => {
      console.debug('[Settings] Reloading to apply server configuration...');
      window.location.reload();
    }, 500);
  };

  const saveForAction = () => {
    const settings: ActionSettings = {
      showRatings: [showRatings, showRatings, showRatings, showRatings],
      debugLevel: debugLevel,
      kFactor: Math.max(1, Math.min(100, kFactor || 20)),
    };
    const userSettings: UserSettings = {
      server: serverUrl.trim(),
      apiKey: apiKey.trim(),
    };
    onSaveBeforeAction?.(settings, userSettings);
  };

  const handleSetSampleData = () => {
    debugClick("Settings:Set Sample Data");
    console.debug(">>> [SETTINGS ACTION] Set Sample Data");
    if (
      window.confirm(
        "Are you sure you want to reset all data to sample data? This will clear all loaded players and game results.",
      )
    ) {
      saveForAction();
      onReset();
      onClose();
    }
  };

  const handleClearAll = () => {
    debugClick("Settings:Clear All");
    console.debug(">>> [SETTINGS ACTION] Clear All");
    if (
      window.confirm(
        "Are you sure you want to clear all data? This will leave the grid blank.",
      )
    ) {
      saveForAction();
      onClearAll();
      onClose();
    }
  };

  const handleNewDay = () => {
    debugClick("Settings:New Day");
    console.debug(">>> [SETTINGS ACTION] New Day");
    if (
      window.confirm(
        "Are you sure you want to start a new day? This will copy New Rating to Previous Rating and clear reports.",
      )
    ) {
      saveForAction();
      onNewDay();
      onClose();
    }
  };

  const handleNewDayWithReRank = () => {
    debugClick("Settings:New Day + Re-rank");
    console.debug(">>> [SETTINGS ACTION] New Day with Re-rank");
    if (
      window.confirm(
        "Are you sure you want to start a new day with re-ranking? This will copy New Rating to Previous Rating, clear reports, and sort players by rating.",
      )
    ) {
      saveForAction();
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
            onClick={() => { debugClick("Settings:Close"); onClose(); }}
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

            {/* tooltip.md: [Settings Panel] Configuration Section */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                title={tt("Show/hide rating columns in the ladder table")}
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
                title={tt("Rating groups displayed when 'Show ratings' is enabled")}
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

            {/* tooltip.md: [Settings Panel] Configuration Section */}
            <div style={{ marginBottom: "1.5rem" }}>
              <label
                title={tt("Enable/disable hover tooltips on menu items and settings")}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <input
                  type="checkbox"
                  checked={tooltipsEnabled}
                  onChange={() => setTooltipsEnabled()}
                />
                <span>Show Tooltips</span>
              </label>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#64748b",
                  marginTop: "0.25rem",
                  paddingLeft: "1.5rem",
                }}
              >
                Hover over menu items and settings to see descriptions
              </p>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label
                htmlFor="debugLevel"
                title={tt("Controls console log verbosity")}
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
                title={tt("0=all logs, 5=default, 10+=critical")}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  debugInput("Debug Level", e.target.value);
                  setDebugLevel(
                    e.target.value === '' || isNaN(parsed) ? 5 : Math.max(0, Math.min(20, parsed)),
                  );
                }}
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
                title={tt("Controls how much ratings change per game")}
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
                title={tt("Default is 20. Higher values make ratings more volatile")}
                onChange={(e) => {
                  debugInput("K-Factor", e.target.value);
                  setKFactor(
                    Math.max(1, Math.min(100, parseInt(e.target.value) || 20)),
                  );
                }}
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
{isAdmin && (
                 <>
                   {/* tooltip.md: [Settings Panel] Actions Section */}
                   {onWalkThroughReports && (
                     <button
                       title={tt("Step through game-by-game rating calculations")}
                       onClick={() => {
                         debugClick("Settings:Walk Through Reports");
                         saveForAction();
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

                   {onGenerateTrophies && (
                     <button
                       title={tt("Generate trophy report for all players and mini-games")}
                       onClick={() => {
                         console.debug(">>> [SETTINGS ACTION] Generate Trophies");
                         debugClick("Settings:Generate Trophies");
                         saveForAction();
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
                     <BarChart3 size={16} />
                        Generate Trophies
                      </button>
                    )}

                    {onGenerateActivityReport && (
                      <button
                        title={tt("Generate a report of player activity and game counts")}
                        onClick={() => {
                          console.debug(">>> [SETTINGS ACTION] Generate Activity Report");
                          debugClick("Settings:Generate Activity Report");
                          saveForAction();
                          onClose();
                          onGenerateActivityReport();
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.5rem",
                          padding: "0.75rem",
                          backgroundColor: "#8b5cf6",
                          color: "white",
                          border: "none",
                          borderRadius: "0.25rem",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                        }}
                      >
                        <BarChart3 size={16} />
                        Generate Activity Report
                      </button>
                    )}

 {!miniGamesHaveResults && (
                      <>
                        <button
                          title={tt("Start a new day: copy New Rating to Previous Rating, clear reports")}
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
                         title={tt("Start a new day and re-rank players by rating")}
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

                   {miniGamesHaveResults && onExportTournamentFiles && (
                     <button
                       title={tt("Export all mini-game .tab files as a ZIP archive")}
                       onClick={() => {
                         console.debug(">>> [SETTINGS ACTION] Export Tournament Files");
                         debugClick("Settings:Export Tournament Files");
                         saveForAction();
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

 {!miniGamesHaveResults && onImportSingleMiniGame && (
                      <button
                        title={tt("Import a single .tab file into a mini-game slot")}
                        onClick={() => {
                          console.debug(">>> [SETTINGS ACTION] Import Single Mini-Game");
                          debugClick("Settings:Import Single Mini-Game");
                          saveForAction();
                          onClose();
                          onImportSingleMiniGame();
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.5rem",
                          padding: "0.75rem",
                          backgroundColor: "#059669",
                          color: "white",
                          border: "none",
                          borderRadius: "0.25rem",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                        }}
                      >
                        <CalendarDays size={16} />
                        Import Single Mini-Game
                      </button>
                    )}

                   {/* Space between good and destructive */}
                   <div style={{ height: "1rem" }} />

                   {/* Destructive buttons */}
                   {onImportTournamentFiles && (
                     <button
                       title={tt("Import multiple .tab files from a ZIP archive")}
                       onClick={() => {
                         console.debug(">>> [SETTINGS ACTION] Import Tournament Files");
                         debugClick("Settings:Import Tournament Files");
                         saveForAction();
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

                   {onClearMiniGames && (
                     <button
                       title={tt("Remove all 7 mini-game .tab files")}
                       onClick={() => {
                         console.debug(">>> [SETTINGS ACTION] Clear Mini-Games");
                         debugClick("Settings:Clear Mini-Games");
                         if (window.confirm("Clear all mini-game files? This will remove all 7 mini-game .tab files.")) {
                           saveForAction();
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

                   <button
                     title={tt("Clear all game results, keep player data intact")}
                     onClick={handleClearAll}
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

                  {!miniGamesHaveResults && (
                     <button
                       title={tt("Reset to sample data for testing")}
                       onClick={handleSetSampleData}
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
                   )}
                </>
              )}
            </div>
          </div>
        </div>
        )}

        {/* tooltip.md: [Settings Panel] Server Connection Section */}
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
            title={tt("Configure connection to the ladder server")}
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

          {onToggleAdmin && (!serverUrl.trim() || apiKey.trim()) && (
            <div style={{ marginBottom: '1.5rem' }}>
              <button
                title={tt(isAdmin ? "Exit admin mode and release the admin lock" : "Enter admin mode to access configuration and actions")}
                onClick={async () => {
                  debugClick("Settings:Toggle Admin Mode");
                  setAdminToggleLoading(true);
                  try {
                    await onToggleAdmin();
                  } finally {
                    setAdminToggleLoading(false);
                  }
                }}
                disabled={adminToggleLoading}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  padding: "0.75rem",
                  backgroundColor: isAdmin ? "#dc2626" : "#059669",
                  color: "white",
                  border: "none",
                  borderRadius: "0.25rem",
                  cursor: adminToggleLoading ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  opacity: adminToggleLoading ? 0.7 : 1,
                }}
              >
                <Shield size={16} />
                {adminToggleLoading
                  ? "Connecting..."
                  : isAdmin
                    ? "Exit Admin Mode"
                    : "Enter Admin Mode"}
              </button>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#64748b",
                  marginTop: "0.5rem",
                }}
              >
                {isAdmin
                  ? "You are in admin mode. Click to exit and release the admin lock."
                  : !serverUrl.trim()
                    ? "Local mode: enter admin mode to access configuration and actions."
                    : "Enter admin mode to access configuration and actions."}
              </p>
            </div>
          )}
          {hasAdminKey && (
            <div style={{ marginBottom: '1.5rem' }}>
              <label title={tt("Enable random result buttons in Enter Games mode for testing")} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={testMode}
                  onChange={(e) => setTestMode(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>Test Mode</span>
              </label>
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', marginLeft: '1.25rem' }}>
                Enable random result buttons in Enter Games mode for testing.
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              {lastWorkingConfig && (
                <button
                  title={tt("Restore the last working server URL and API key")}
                  onClick={() => {
                    debugClick("Settings:Restore Last Server Config");
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
                title={tt("URL of the ladder server")}
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
                  title={tt("When empty, data is stored in browser localStorage only")}
                  onChange={(e) => {
                    debugInput("Server URL", e.target.value);
                    setServerUrl(normalizeServerUrl(e.target.value));
                  }}
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
                title={tt("API key for server authentication")}
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
                  title={tt("Provided by the server administrator")}
                  onChange={(e) => {
                    debugInput("API Key", e.target.value);
                    setApiKey(e.target.value);
                  }}
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
          
          
        </div>

        <div style={{ display: "flex", gap: "1rem", marginTop: "2rem" }}>
          <button onClick={() => { debugClick("Settings:Cancel"); onClose(); }}>Cancel</button>
          <button onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
