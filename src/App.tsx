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
      const wasServer = oldMode !== 'a';
      const isNowServer = newMode !== 'a';
      
      setWasServerMode(wasServer);
      
      // Show reconnect dialog on mode transition
      if (wasServer !== isNowServer) {
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
          onDismiss={() => setShowReconnectDialog(false)}
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
