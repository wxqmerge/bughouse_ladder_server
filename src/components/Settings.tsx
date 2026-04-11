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
} from "lucide-react";
import "../css/index.css";

interface SettingsProps {
  onClose: () => void;
  onReset: () => void;
  onClearAll: () => void;
  onNewDay: () => void;
  onNewDayWithReRank: () => void;
  onWalkThroughReports?: () => void;
}

export default function Settings({
  onClose,
  onReset,
  onClearAll,
  onNewDay,
  onNewDayWithReRank,
  onWalkThroughReports,
}: SettingsProps) {
  const [showRatings, setShowRatings] = useState(true);
  const [debugLevel, setDebugLevel] = useState(5);
  const [kFactor, setKFactor] = useState(20);

  useEffect(() => {
    const savedSettings = localStorage.getItem("ladder_settings");
    if (savedSettings) {
      try {
        const parsedSettings = JSON.parse(savedSettings);
        setShowRatings(parsedSettings.showRatings ?? true);
        setDebugLevel(parsedSettings.debugLevel ?? 5);
        setKFactor(parsedSettings.kFactor ?? 20);
      } catch (err) {
        console.error("Failed to parse settings:", err);
      }
    }
  }, []);

  const handleSave = () => {
    console.log(">>> [BUTTON PRESSED] Save (Settings)");
    const settings = {
      showRatings: [showRatings, showRatings, showRatings, showRatings],
      debugLevel: debugLevel,
      kFactor: Math.max(1, Math.min(100, kFactor || 20)),
    };
    localStorage.setItem("ladder_settings", JSON.stringify(settings));
    onClose();
    alert("Settings saved successfully!");
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
            </div>
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
