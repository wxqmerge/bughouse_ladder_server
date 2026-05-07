import { useState, useRef, useEffect } from "react";
import LadderForm from "./components/LadderForm";
import Settings from "./components/Settings";
import { MigrationDialog } from "./components/MigrationDialog";
import { ReconnectDialog } from "./components/ReconnectDialog";
import { StatusBanner } from "./components/StatusBanner";
import { loadSampleData } from "./components/LadderForm";
import type { PlayerData } from "./utils/hashUtils";
import { getNextTitle, processNewDayTransformations, isMiniGameTitle } from "./utils/constants";
import { formatPrefixToTitle } from "./utils/titleUtils";
import {
  updateConnectionState,
  initializeConnectionState,
  startPeriodicChecks,
  stopPeriodicChecks,
  onModeChange,
  getProgramMode,
  isLocalMode,
} from "./utils/mode";
import { loadUserSettings, loadConfigFromUrl } from "./services/userSettingsStorage";
import { dataService } from "./services/dataService";
import { clearTournamentState, getTournamentState } from "./services/storageService";
import { checkMigrationNeeded, storeCurrentMode } from "./utils/migrationUtils";
import {
  savePlayers,
  getPlayers,
  getProjectName,
  setProjectName,
  setProjectName as setProjectNameStorage,
  getKeyPrefix,
  startBatch,
  endBatch,
  getHasLocalChanges,
  clearLocalChangesFlag,
  replayPendingDeletes,
  clearSettings,
  setPendingNewDay,
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [triggerWalkthrough, setTriggerWalkthrough] = useState(false);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [showReconnectDialog, setShowReconnectDialog] = useState(false);
  // Track mode transitions properly to avoid false positives on initial load
  const [initialDetectionDone, setInitialDetectionDone] = useState(false);
  const [lastKnownMode, setLastKnownMode] = useState<'local' | 'server_down' | 'server' | null>(null);
  // Show server-down blocking dialog on first load if server is unreachable
  const [showServerDownBlocking, setShowServerDownBlocking] = useState(false);
  // Tournament state
  const [tournamentActive, setTournamentActive] = useState(false);

  // Check tournament status on mount (server mode)
  useEffect(() => {
    const checkTournamentStatus = async () => {
      try {
        const userSettings = loadUserSettings();
        const serverUrl = userSettings.server?.trim();
        
        if (serverUrl) {
          // Server mode - check API
          const state = await dataService.getTournamentStatus();
          setTournamentActive(state.active || false);
        } else {
          // Local mode - check localStorage
          const state = getTournamentState();
          setTournamentActive(state?.active || false);
        }
      } catch (error) {
        console.error('Failed to check tournament status:', error);
      }
    };
    
    checkTournamentStatus();
  }, []);
  const [versionMismatch, setVersionMismatch] = useState(false);
  const [urlConfigApplied, setUrlConfigApplied] = useState(false);
  const [status, setStatus] = useState<string | null>("Initializing...");
  const recalculateRef = useRef<(() => void) | undefined>(undefined);
  const refreshPlayersRef = useRef<(() => void) | undefined>(undefined);

  // Cache bust: reload if build timestamp differs from last visit
  useEffect(() => {
    const metaTag = document.querySelector('meta[name="build-timestamp"]');
    const buildTs = metaTag?.getAttribute('content');
    if (buildTs) {
      const lastBuildTs = localStorage.getItem('last-build-timestamp');
      if (lastBuildTs && lastBuildTs !== buildTs) {
        localStorage.setItem('last-build-timestamp', buildTs);
        window.location.reload();
        return;
      }
      localStorage.setItem('last-build-timestamp', buildTs);
    }
  }, []);

  // Set document title to the formatted prefix
  useEffect(() => {
    document.title = formatPrefixToTitle(getKeyPrefix());
  }, []);

  // Load URL-based config, initialize connection state, and test connectivity on mount
  useEffect(() => {
    const init = async () => {
      // Step 1: Load URL params (saves server+key to localStorage)
      const configApplied = await loadConfigFromUrl();
      if (configApplied) {
        setUrlConfigApplied(true);
      }

      // Step 2: Initialize connection state from localStorage (now has fresh config)
      initializeConnectionState();

      // Step 3: Test server connectivity
      setStatus("Checking server connection...");
      updateConnectionState()
        .then(async () => {
          setStatus(null);

          const mode = getProgramMode();
          setInitialDetectionDone(true);
          setLastKnownMode(mode as 'local' | 'server_down' | 'server');

          // Show blocking dialog on first load if server is unreachable
          if (mode === 'server_down') {
            console.log('[APP] Server unreachable on initial load - showing blocking dialog');
            setShowServerDownBlocking(true);
          }

          // Start polling for data updates in server mode (every 5 seconds)
          if (mode !== 'local' && mode !== 'server_down') {
            console.log('[APP] Initializing data sync...');
            await dataService.initializeHash();
            console.log('[APP] Starting data polling (5 second interval)');
            dataService.startPolling(5000);

            const unsubscribe = dataService.subscribe(() => {
              console.log('[APP] Data changed - notifying LadderForm');
              if (refreshPlayersRef.current) {
                refreshPlayersRef.current();
              }
            });
            (window as any).__ladder_dataServiceUnsubscribe = unsubscribe;

            // Start write health polling (every 10 seconds)
            const healthCheckInterval = setInterval(async () => {
              try {
                const userSettings = loadUserSettings();
                const serverUrl = userSettings.server?.trim();
                if (!serverUrl) return;

                const response = await fetch(`${serverUrl}/health`);
                if (!response.ok) return;

                const data = await response.json();

                // Check version mismatch
                if (data.version) {
                  const clientVersion = import.meta.env.PACKAGE_VERSION;
                  if (data.version !== clientVersion) {
                    console.warn(`[APP] Version mismatch: client=${clientVersion}, server=${data.version}`);
                    setVersionMismatch(true);
                  }
                }

                // Check write health
                if (data.writeHealth) {
                  const wh = data.writeHealth;
                  if (wh.consecutiveFailures > 0) {
                    console.warn(`[APP] Server write errors: ${wh.consecutiveFailures} consecutive failures. Last error: ${wh.lastError}`);
                  }
                }
              } catch {
                // Health check failed - server unreachable, no action needed
              }
            }, 10000);

            (window as any).__ladder_healthCheckInterval = healthCheckInterval;
          }
        })
        .catch(console.error);

      // Step 4: Set up mode change callback
      onModeChange((newMode: string, oldMode: string) => {
        console.log(`[MODE CHANGE] ${oldMode} -> ${newMode}`);

        if (!initialDetectionDone) {
          setLastKnownMode(newMode as 'local' | 'server_down' | 'server');
          setInitialDetectionDone(true);
          return;
        }

        const wasServer = lastKnownMode === 'server';
        const isNowServer = newMode === 'server';
        const wasServerDown = lastKnownMode === 'server_down';

        setLastKnownMode(newMode as 'local' | 'server_down' | 'server');

        if ((wasServerDown && isNowServer) || (wasServer && !isNowServer)) {
          setShowReconnectDialog(true);
        }
      });

      // Step 5: Start periodic checks (every 10 seconds)
      startPeriodicChecks();

      // Step 6: Check for migration needs
      const migrationCheck = checkMigrationNeeded();
      if (migrationCheck.needed) {
        setShowMigrationDialog(true);
      } else {
        storeCurrentMode(migrationCheck.toMode);
      }
    };

    init();

    return () => {
      stopPeriodicChecks();

      const mode = getProgramMode();
      if (mode !== 'local' && mode !== 'server_down') {
        console.log('[APP] Stopping data polling');
        dataService.stopPolling();

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
    try {
      const userSettings = loadUserSettings();
      const serverUrl = userSettings.server?.trim();
      
      if (serverUrl) {
        await dataService.clearMiniGames();
      }
      
      clearTournamentState();
      setTournamentActive(false);
    } catch (error) {
      console.error('Failed to clear mini-games:', error);
    }
    
    await savePlayers([]);
    clearSettings();
    window.location.reload();
  };

  const handleClearMiniGames = async () => {
    try {
      const userSettings = loadUserSettings();
      const serverUrl = userSettings.server?.trim();
      
      if (serverUrl) {
        await dataService.clearMiniGames();
      }
      
      clearTournamentState();
      setTournamentActive(false);
      setProjectName('Ladder');
      setProjectNameStorage('Ladder');
      alert('Mini-game files cleared');
      window.location.reload();
    } catch (error) {
      console.error('Failed to clear mini-games:', error);
      alert('Failed to clear: ' + (error as Error).message);
    }
  };

  const processNewDay = async (reRank: boolean) => {
    try {
      const players = await getPlayers();
      if (players && players.length > 0) {
        const currentTitle = getProjectName();
        const isTournament = tournamentActive;
        
        if (isTournament) {
          try {
            const userSettings = loadUserSettings();
            const serverUrl = userSettings.server?.trim();
            
            if (serverUrl) {
              await dataService.saveMiniGameFile(currentTitle);
              console.log(`[App] Saved mini-game file: ${currentTitle}`);
            }
          } catch (error) {
            console.error(`Failed to save mini-game file ${currentTitle}:`, error);
          }
        }
        
        const nextTitle = getNextTitle(currentTitle);

        const finalPlayers = processNewDayTransformations(players, reRank);

      await savePlayers(finalPlayers);
      setProjectNameStorage(nextTitle);
      clearSettings();
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
      setPendingNewDay({ reRank });
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

  // ==================== TOURNAMENT HANDLERS ====================

  const handleEndTournament = async () => {
    try {
      const userSettings = loadUserSettings();
      const serverUrl = userSettings.server?.trim();
      
      if (serverUrl) {
        // Server mode - call API
        await dataService.endTournament();
        clearTournamentState();
        setTournamentActive(false);
        alert('Tournament ended');
      } else {
        // Local mode - clear state
        clearTournamentState();
        setTournamentActive(false);
        alert('Tournament ended');
      }
    } catch (error) {
      console.error('Failed to end tournament:', error);
      alert('Failed to end tournament: ' + (error as Error).message);
    }
  };

  const handleEndTournamentOnly = () => {
    clearTournamentState();
    setTournamentActive(false);
  };

  const handleExportTournamentFiles = async () => {
    try {
      const blob = await dataService.exportTournamentFiles();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tournament_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export tournament files:', error);
      alert('Failed to export: ' + (error as Error).message);
    }
  };

  const handleGenerateTrophies = async () => {
    try {
      const blob = await dataService.generateTrophyReport();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tournament_trophies_${new Date().toISOString().split('T')[0]}.tab`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to generate trophies:', error);
      alert('Failed to generate trophies: ' + (error as Error).message);
    }
  };

  const handleExportMiniData = async () => {
    try {
      const blob = await dataService.exportMiniData();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mini_data_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to export mini data:', error);
      alert('Failed to export: ' + (error as Error).message);
    }
  };

  const handleTitleSwitch = async (newTitle: string) => {
    const currentTitle = getProjectName();
    const isTournament = tournamentActive;
    const currentIsMiniGame = isMiniGameTitle(currentTitle);
    const newIsMiniGame = isMiniGameTitle(newTitle);
    
    if (isTournament && currentIsMiniGame && !newIsMiniGame) {
      if (window.confirm(`End tournament and switch to "${newTitle}"? Mini-game files will be preserved.`)) {
        handleEndTournamentOnly();
      } else {
        return false;
      }
    }
    
    return true;
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
      {urlConfigApplied && (
        <div style={{
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '0.5rem',
          padding: '1rem 1.5rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}>
          <div>
            <p style={{ margin: 0, fontWeight: 600, color: '#92400e' }}>
              URL configuration applied
            </p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#a16207' }}>
              Server settings have been saved. Open Settings to verify or edit.
            </p>
          </div>
          <button
            onClick={() => {
              setUrlConfigApplied(false);
              setShowSettings(true);
            }}
            style={{
              backgroundColor: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            Open Settings
          </button>
        </div>
      )}
      <StatusBanner status={status} />
      
      {showMigrationDialog && (
        <MigrationDialog 
          isAdmin={false}
          onClose={() => setShowMigrationDialog(false)} 
        />
      )}
      
      
      
      {showReconnectDialog && (
        <ReconnectDialog
          wasServerMode={lastKnownMode === 'server' || lastKnownMode === 'server_down'}
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
        onAdminChange={setIsAdmin}
        showServerDownBlocking={showServerDownBlocking}
        onDismissServerDown={() => setShowServerDownBlocking(false)}
        versionMismatch={versionMismatch}
        setVersionMismatch={setVersionMismatch}
        onTitleSwitch={handleTitleSwitch}
        onExportMiniData={handleExportMiniData}
      />
      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          onReset={handleReset}
          onClearAll={handleClearAll}
          onNewDay={handleNewDay}
          onNewDayWithReRank={handleNewDayWithReRank}
          onWalkThroughReports={handleWalkThroughReports}
          onClearMiniGames={isAdmin ? handleClearMiniGames : undefined}
          onExportTournamentFiles={isAdmin ? handleExportTournamentFiles : undefined}
          onGenerateTrophies={isAdmin ? handleGenerateTrophies : undefined}
          isTournamentActive={tournamentActive}
          isAdmin={isAdmin}
        />
      )}
    </>
  );
}

export default App;
