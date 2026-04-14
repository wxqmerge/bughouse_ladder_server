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
import { loadUserSettings } from "./services/userSettingsStorage";
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
  replayPendingDeletes,
} from "./services/storageService";
import { dataService } from "./services/dataService";
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
  // Track mode transitions properly to avoid false positives on initial load
  const [initialDetectionDone, setInitialDetectionDone] = useState(false);
  const [lastKnownMode, setLastKnownMode] = useState<'local' | 'server_down' | 'dev' | 'server' | null>(null);
  const [status, setStatus] = useState<string | null>("Initializing...");
  const recalculateRef = useRef<(() => void) | undefined>(undefined);
  const refreshPlayersRef = useRef<(() => void) | undefined>(undefined);

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
      .then(async () => {
        setStatus(null); // Clear status after connection check
        
        // Start polling for data updates in server mode (every 5 seconds)
        const mode = getProgramMode();
        if (mode !== 'local' && mode !== 'server_down') {
          console.log('[APP] Initializing data sync...');
          // Initialize hash from current server state
          await dataService.initializeHash();
          console.log('[APP] Starting data polling (5 second interval)');
          dataService.startPolling(5000);
          
          // Subscribe to data changes and notify LadderForm
          const unsubscribe = dataService.subscribe(() => {
            console.log('[APP] Data changed - notifying LadderForm');
            if (refreshPlayersRef.current) {
              refreshPlayersRef.current();
            }
          });
          
          // Store unsubscribe for cleanup
          (window as any).__ladder_dataServiceUnsubscribe = unsubscribe;
        }
      })
      .catch(console.error);
    
    // Set up mode change callback
    onModeChange((newMode: string, oldMode: string) => {
      console.log(`[MODE CHANGE] ${oldMode} -> ${newMode}`);
      
      if (!initialDetectionDone) {
        // First detection - just record, don't show dialog
        setLastKnownMode(newMode as 'local' | 'server_down' | 'dev' | 'server');
        setInitialDetectionDone(true);
        return;
      }
      
      // Now we can detect ACTUAL transitions (not initial state)
      const wasServer = lastKnownMode === 'server' || lastKnownMode === 'dev';
      const isNowServer = newMode === 'server' || newMode === 'dev';
      const wasServerDown = lastKnownMode === 'server_down';
      
      setLastKnownMode(newMode as 'local' | 'server_down' | 'dev' | 'server');
      
      // Show reconnect dialog on REAL transitions only:
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
      
      // Stop polling on unmount
      const mode = getProgramMode();
      if (mode !== 'local' && mode !== 'server_down') {
        console.log('[APP] Stopping data polling');
        dataService.stopPolling();
        
        // Unsubscribe from data changes
        if ((window as any).__ladder_dataServiceUnsubscribe) {
          (window as any).__ladder_dataServiceUnsubscribe();
          (window as any).__ladder_dataServiceUnsubscribe = null;
        }
      }
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

  const handleSetRefreshPlayersRef = (ref: () => void) => {
    refreshPlayersRef.current = ref;
  };

  // Handle pulling from server (merge with local changes)
  const handlePullFromServer = async () => {
    console.log("[Reconnect] Pulling from server - merging with local changes");
    try {
      // Replay pending deletes first
      await replayPendingDeletes();
      
      // Fetch fresh data from server
      const userSettings = loadUserSettings();
      const serverUrl = userSettings.server;
      if (serverUrl) {
        const response = await fetch(`${serverUrl}/api/ladder`);
        if (response.ok) {
          const data = await response.json();
          const serverPlayers = data.data?.players || [];
          
          // Get local players for merge
          const localPlayers = await getPlayers();
          
          // Simple merge: keep server as base, preserve local unconfirmed entries
          const mergedPlayers = serverPlayers.map((sp: any) => {
            const localPlayer = localPlayers.find((lp: any) => lp.rank === sp.rank);
            if (localPlayer && localPlayer.gameResults) {
              const mergedGameResults = [...(sp.gameResults || new Array(31).fill(null))];
              for (let r = 0; r < 31; r++) {
                const localResult = localPlayer.gameResults[r];
                const serverResult = sp.gameResults?.[r];
                // Preserve local unconfirmed entries
                if (localResult && localResult.trim() && !localResult.endsWith('_')) {
                  mergedGameResults[r] = localResult;
                }
              }
              return { ...sp, gameResults: mergedGameResults };
            }
            return sp;
          });
          
          // Save merged data
          startBatch();
          await savePlayers(mergedPlayers);
          await endBatch();
          
          // Clear flags
          clearLocalChangesFlag();
          
          console.log(`[Reconnect] Pulled and merged ${serverPlayers.length} players from server`);
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

  // Handle pushing to server (merge local changes with server)
  const handlePushToServer = async () => {
    console.log("[Reconnect] Pushing to server - merging local changes");
    try {
      // Replay pending deletes first
      await replayPendingDeletes();
      
      // Get local players
      const localPlayers = await getPlayers();
      
      // Save to server with wait for confirmation
      const userSettings = loadUserSettings();
      const serverUrl = userSettings.server;
      if (serverUrl) {
        const response = await fetch(`${serverUrl}/api/ladder`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ players: localPlayers }),
        });
        
        if (response.ok) {
          console.log(`[Reconnect] Pushed ${localPlayers.length} players to server`);
          
          // Clear flags
          clearLocalChangesFlag();
          
          setShowReconnectDialog(false);
          alert("Successfully synced local changes to server!");
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
          wasServerMode={lastKnownMode === 'server' || lastKnownMode === 'dev' || lastKnownMode === 'server_down'}
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
        onSetRefreshPlayersRef={handleSetRefreshPlayersRef}
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
