import { useState, useRef, useEffect } from "react";
import LadderForm from "./components/LadderForm";
import Settings from "./components/Settings";
import { MigrationDialog } from "./components/MigrationDialog";
import { ReconnectDialog } from "./components/ReconnectDialog";
import { StatusBanner } from "./components/StatusBanner";
import { loadSampleData } from "./components/LadderForm";
import type { PlayerData } from "./utils/hashUtils";
import { getNextTitle, processNewDayTransformations } from "./utils/constants";
import {
  updateConnectionState,
  startPeriodicChecks,
  stopPeriodicChecks,
  onModeChange,
  getProgramMode,
  isLocalMode,
} from "./utils/mode";
import { checkMigrationNeeded, storeCurrentMode } from "./utils/migrationUtils";
import {
  savePlayers,
  getPlayers,
  getProjectName,
  setProjectName as setProjectNameStorage,
  getKeyPrefix,
  startBatch,
  endBatch,
  getHasLocalChanges,
  clearLocalChangesFlag,
} from "./services/storageService";
import "./css/index.css";

// Global status tracking
let setStatusCallback: ((status: string | null) => void) | null = null;

export function setAppStatus(status: string | null): void {
  if (setStatusCallback) {
    setStatusCallback(status);
  }
}

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [triggerWalkthrough, setTriggerWalkthrough] = useState(false);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [showReconnectDialog, setShowReconnectDialog] = useState(false);
  const [wasServerMode, setWasServerMode] = useState(true); // Assume server mode initially
  const [status, setStatus] = useState<string | null>("Initializing...");
  const recalculateRef = useRef<(() => void) | undefined>(undefined);

  // Set up status callback for child components
  useEffect(() => {
    setStatusCallback = setStatus;
    return () => {
      setStatusCallback = null;
    };
  }, []);

  // Test server connectivity and check for migration on mount
  useEffect(() => {
    // Initial connectivity test
    setStatus("Checking server connection...");
    updateConnectionState()
      .then(() => {
        setStatus(null); // Clear status after connection check
      })
      .catch(console.error);
    
    // Set up mode change callback
    onModeChange((newMode: string, oldMode: string) => {
      console.log(`[MODE CHANGE] ${oldMode} -> ${newMode}`);
      const wasServer = oldMode === 'server' || oldMode === 'dev';
      const isNowServer = newMode === 'server' || newMode === 'dev';
      const wasServerDown = oldMode === 'server_down';
      
      setWasServerMode(wasServer || wasServerDown);
      
      // Show reconnect dialog when:
      // 1. Transitioning from server_down to server/dev (reconnection with possible local changes)
      // 2. Transitioning from server/dev to server_down (disconnection notification)
      if ((wasServerDown && isNowServer) || (wasServer && !isNowServer)) {
        setShowReconnectDialog(true);
      }
    });
    
    // Start periodic checks (every 10 seconds)
    startPeriodicChecks();
    
    // Check for migration needs
    const migrationCheck = checkMigrationNeeded();
    if (migrationCheck.needed) {
      setShowMigrationDialog(true);
    } else {
      // Store current mode for future comparisons
      storeCurrentMode(migrationCheck.toMode);
    }
    
    return () => {
      stopPeriodicChecks();
    };
  }, []);

  const handleReset = async () => {
    const samplePlayers = loadSampleData();
    // Use batch mode to defer server sync until done
    startBatch();
    await savePlayers(samplePlayers);
    await endBatch(); // Triggers single server sync
    window.location.reload();
  };

  const handleClearAll = async () => {
    await savePlayers([]);
    localStorage.removeItem(getKeyPrefix() + "ladder_settings");
    window.location.reload();
  };

  const processNewDay = async (reRank: boolean) => {
    try {
      const players = await getPlayers();
      if (players && players.length > 0) {
        const currentTitle = getProjectName();
        const nextTitle = getNextTitle(currentTitle);

        const finalPlayers = processNewDayTransformations(players, reRank);

        await savePlayers(finalPlayers);
        setProjectNameStorage(nextTitle);
        localStorage.removeItem(getKeyPrefix() + "ladder_settings");
        window.location.reload();
      }
    } catch (err) {
      console.error("Failed to process new day:", err);
    }
  };

  const triggerNewDay = (reRank: boolean) => {
    console.log(`>>> [NEW DAY TRIGGERED] reRank=${reRank}`);
    // First, trigger recalculate ratings to check for errors
    if (recalculateRef.current) {
      // Set a flag indicating New Day is pending
      localStorage.setItem(
        getKeyPrefix() + "ladder_pending_newday",
        JSON.stringify({ reRank }),
      );
      console.log(
        `>>> [NEW DAY] Pending flag set: ${JSON.stringify({ reRank })}`,
      );
      // Call recalculate - if there are errors, it will show the error dialog
      // and not complete, so New Day won't proceed
      recalculateRef.current();
    } else {
      // Fallback: just process New Day directly
      console.warn(
        ">>> [NEW DAY] Recalculate ref not available, using fallback",
      );
      processNewDay(reRank);
    }
  };

  const handleNewDay = () => {
    triggerNewDay(false);
  };

  const handleNewDayWithReRank = () => {
    triggerNewDay(true);
  };

  const handleWalkThroughReports = () => {
    setTriggerWalkthrough(true);
  };

  const handleSetRecalculateRef = (ref: () => void) => {
    recalculateRef.current = ref;
  };

  // Handle pulling from server (discard local changes, get server data)
  const handlePullFromServer = async () => {
    console.log("[Reconnect] Pulling from server - discarding local changes");
    try {
      // Fetch fresh data from server
      const serverUrl = import.meta.env.VITE_API_URL;
      if (serverUrl) {
        const response = await fetch(`${serverUrl}/api/ladder`);
        if (response.ok) {
          const data = await response.json();
          const serverPlayers = data.data?.players || [];
          
          // Clear local data and replace with server data
          startBatch();
          await savePlayers(serverPlayers);
          await endBatch();
          
          // Clear local changes flag
          clearLocalChangesFlag();
          
          console.log(`[Reconnect] Pulled ${serverPlayers.length} players from server`);
          setShowReconnectDialog(false);
          
          // Reload to apply changes
          window.location.reload();
        } else {
          console.error("[Reconnect] Failed to pull from server:", response.status);
          alert("Failed to pull from server. Please try again.");
        }
      }
    } catch (error) {
      console.error("[Reconnect] Error pulling from server:", error);
      alert("Error connecting to server. Please try again.");
    }
  };

  // Handle pushing to server (upload local changes, overwrite server)
  const handlePushToServer = async () => {
    console.log("[Reconnect] Pushing to server - uploading local changes");
    try {
      // Get local players
      const localPlayers = await getPlayers();
      
      // Save to server with wait for confirmation
      const serverUrl = import.meta.env.VITE_API_URL;
      if (serverUrl) {
        const response = await fetch(`${serverUrl}/api/ladder`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ players: localPlayers }),
        });
        
        if (response.ok) {
          console.log(`[Reconnect] Pushed ${localPlayers.length} players to server`);
          
          // Clear local changes flag
          clearLocalChangesFlag();
          
          setShowReconnectDialog(false);
          alert("Successfully pushed local changes to server!");
        } else {
          console.error("[Reconnect] Failed to push to server:", response.status);
          alert("Failed to push to server. Please try again.");
        }
      }
    } catch (error) {
      console.error("[Reconnect] Error pushing to server:", error);
      alert("Error connecting to server. Please try again.");
    }
  };

  return (
    <>
      <StatusBanner status={status} />
      
      {showMigrationDialog && (
        <MigrationDialog 
          isAdmin={false}
          onClose={() => setShowMigrationDialog(false)} 
        />
      )}
      

      
      {showReconnectDialog && (
        <ReconnectDialog
          wasServerMode={wasServerMode}
          isNowConnected={!isLocalMode()}
          hasLocalChanges={getHasLocalChanges()}
          onDismiss={() => setShowReconnectDialog(false)}
          onPullFromServer={handlePullFromServer}
          onPushToServer={handlePushToServer}
        />
      )}
      
      <LadderForm
        setShowSettings={setShowSettings}
        triggerWalkthrough={triggerWalkthrough}
        setTriggerWalkthrough={setTriggerWalkthrough}
        onSetRecalculateRef={handleSetRecalculateRef}
      />
      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          onReset={handleReset}
          onClearAll={handleClearAll}
          onNewDay={handleNewDay}
          onNewDayWithReRank={handleNewDayWithReRank}
          onWalkThroughReports={handleWalkThroughReports}
        />
      )}
    </>
  );
}

export default App;
