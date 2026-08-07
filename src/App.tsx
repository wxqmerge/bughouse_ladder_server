import { useState, useRef, useEffect } from "react";
import LadderForm from "./components/LadderForm";
import Settings from "./components/Settings";
import { MigrationDialog } from "./components/MigrationDialog";
import { ReconnectDialog } from "./components/ReconnectDialog";
import { StatusBanner } from "./components/StatusBanner";
import { loadSampleData } from "./components/LadderForm";

import { getNextTitle, processNewDayTransformations, isMiniGameTitle } from "../shared/utils/constants";
import { DEFAULT_GAME_RESULTS, MINI_GAME_FILES } from "../shared/types";
import { detectDuplicateRanks } from "../shared/utils/rankValidation";
import { validatePlayersNamesOnly } from "../shared/utils/sanityCheck";
import { downloadBlob } from "./utils/downloadBlob";
import { formatPrefixToTitle } from "./utils/titleUtils";
import type { ProgramMode } from "./utils/mode";
import {
  updateConnectionState,
  initializeConnectionState,
  getConnectionState,
  startPeriodicChecks,
  stopPeriodicChecks,
  onModeChange,
  getProgramMode,
  isLocalMode,
  isValidServerUrl,
  validateServerUrl,
} from "./utils/mode";
import { loadUserSettings, loadConfigFromUrl, getUserSettingsKey } from "./services/userSettingsStorage";
import { dataService, DataServiceMode } from "./services/dataService";
import { miniGameStore } from "./services/miniGameLocalStorage";
import { saveSettings } from "./services/storageService";
import { saveUserSettings, type UserSettings } from "./services/userSettingsStorage";
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
  getPendingDeletes,
  stopDeltaFlushing,
} from "./services/storageService";
import { mergeServerWithLocal } from "./utils/mergeUtils";
import { getDebugLevel } from "./utils/debug";
import { gatedFetch } from "./utils/requestGate";
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
  const [versionMismatch, setVersionMismatch] = useState(false);
const [miniGamesHaveResults, setMiniGamesHaveResults] = useState(false);
  const [testMode, setTestMode] = useState(() => {
    try {
      const stored = localStorage.getItem('testMode');
      if (stored !== null) return stored === 'true';
    } catch {
      // ignore
    }
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  });
  const [urlConfigApplied, setUrlConfigApplied] = useState(false);
  const [status, setStatus] = useState<string | null>("Initializing...");
  
  const recalculateRef = useRef<(() => void) | undefined>(undefined);
  const refreshPlayersRef = useRef<((force?: boolean) => void) | undefined>(undefined);
  const toggleAdminRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const initRef = useRef(false);

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
    // Guard against double-initialization (React Strict Mode)
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      // Step 1: Load URL params (saves server+key to localStorage)
      const configApplied = await loadConfigFromUrl();
      if (configApplied) {
        setUrlConfigApplied(true);
      }

      // Step 2: Determine mode and configure dataService
      const config = await determineMode();
      dataService.updateConfig(config);
      // console.log('[App] DataService configured:', config.mode, config.serverUrl || '');

      // Step 2.5: Wire up miniGameStore for all modes (localStorage cache + local mini-game support)
      dataService.updateConfig({ miniGameStore });
      // console.log('[App] Wired up miniGameStore');

      // Step 3: Initialize connection state from localStorage (now has fresh config)
      await initializeConnectionState();

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
            console.debug('[APP] Server unreachable on initial load - showing blocking dialog');
            setShowServerDownBlocking(true);
          }

          // Start polling for data updates in server mode (every 5 seconds)
          if (mode !== 'local' && mode !== 'server_down') {
            // Hash init moved to LadderForm - it calls dataService.setHash() after fetching players
            // console.log('[APP] Starting data polling (60 second interval)');
             dataService.startPolling();
            
            // Start SSE for real-time updates (polling remains as fallback)
            dataService.startSSE();

            const unsubscribe = dataService.subscribe(() => {
              // Dedup: skip if a refresh is already in flight (300ms window)
              // Multiple SSE events for the same server write would trigger
              // redundant fetches; coalesce them into one.
              const now = Date.now();
              if ((window as any).__ladder_lastRefresh && now - (window as any).__ladder_lastRefresh < 300) {
                console.debug(`[PERF DEDUP] Skipping refresh — last was ${now - (window as any).__ladder_lastRefresh}ms ago`);
                return;
              }
              (window as any).__ladder_lastRefresh = now;
              console.debug('[APP] Data changed - notifying LadderForm');
              if (refreshPlayersRef.current) {
                refreshPlayersRef.current();
              }
            });
            (window as any).__ladder_dataServiceUnsubscribe = unsubscribe;

            // Start write health polling with exponential backoff
            let healthCheckPending = false;
            let healthCheckFailures = 0;
            const BASE_HEALTH_INTERVAL = 30000;
            const MAX_HEALTH_INTERVAL = 300000;
            const scheduleHealthCheck = () => {
              const interval = Math.min(
                BASE_HEALTH_INTERVAL * Math.pow(2, healthCheckFailures),
                MAX_HEALTH_INTERVAL
              );
              return setTimeout(doHealthCheck, interval);
            };
            const doHealthCheck = async () => {
              if (healthCheckPending) {
                scheduleHealthCheck();
                return;
              }
              healthCheckPending = true;
              try {
                const userSettings = loadUserSettings();
                const serverUrl = userSettings.server?.trim();
                if (!serverUrl) {
                  scheduleHealthCheck();
                  return;
                }

                const response = await gatedFetch(`${serverUrl}/health`);
                if (!response.ok) {
                  scheduleHealthCheck();
                  return;
                }

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
                healthCheckFailures = 0;
              } catch (e) {
                healthCheckFailures++;
                console.warn(`[APP] Health check failed (${healthCheckFailures} consecutive):`, e);
              } finally {
                healthCheckPending = false;
                scheduleHealthCheck();
              }
            };
            const healthCheckTimeout = scheduleHealthCheck();

            (window as any).__ladder_healthCheckInterval = {
              clear: () => {
                if (healthCheckTimeout) clearTimeout(healthCheckTimeout);
              },
            };
          }

          // Check for migration needs
          const migrationCheck = await checkMigrationNeeded(mode as ProgramMode);
          if (migrationCheck.needed) {
            setShowMigrationDialog(true);
          } else {
            storeCurrentMode(migrationCheck.toMode);
          }
        })
        .catch(console.error);

      // Step 4: Set up mode change callback
      onModeChange((newMode: string, oldMode: string) => {
        console.debug(`[MODE CHANGE] ${oldMode} -> ${newMode}`);

        if (!initialDetectionDone) {
          setLastKnownMode(newMode as 'local' | 'server_down' | 'server');
          setInitialDetectionDone(true);
          return;
        }

        const wasServer = oldMode === 'server';
        const isNowServer = newMode === 'server';
        const wasServerDown = oldMode === 'server_down';

        setLastKnownMode(newMode as 'local' | 'server_down' | 'server');

        if ((wasServerDown && isNowServer) || (wasServer && !isNowServer)) {
          setShowReconnectDialog(true);
        }

        if (oldMode === 'local' && newMode === 'server') {
          console.debug('[MODE CHANGE] Local -> Server: fetching fresh data');
            dataService.initializeHash().then(async () => {
            dataService.startPolling();
            dataService.startSSE();
            if (refreshPlayersRef.current) {
              console.debug('[MODE CHANGE] Calling refreshPlayersRef.current()');
              await refreshPlayersRef.current();
            } else {
              console.warn('[MODE CHANGE] refreshPlayersRef.current is not set yet, fetching directly');
              const freshPlayers = await dataService.getPlayers();
              console.debug('[MODE CHANGE] Fetched', freshPlayers.length, 'players directly');
            }
          }).catch(console.error);
        }
      });

      // Step 5: Start periodic checks (every 10 seconds)
      startPeriodicChecks();
    };

    init();

    return () => {
      stopPeriodicChecks();
      stopDeltaFlushing();

      const mode = getProgramMode();
      if (mode !== 'local' && mode !== 'server_down') {
        console.debug('[APP] Stopping data polling and SSE');
        dataService.stopPolling();
        dataService.stopSSE();

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
    console.log('[App] Clear All: starting...');

    // Switch to main ladder so savePlayers([]) clears the main ladder, not a mini-game
    const wasMiniGame = dataService.getMiniGameFile();
    if (wasMiniGame) {
      dataService.setMiniGameFile(null);
      console.log('[App] Clear All: switched from mini-game to main ladder');
    }

    try {
      await dataService.savePlayers([]);
      console.log('[App] Clear All: main ladder cleared');
    } catch (error) {
      console.error('[App] Clear All: failed to clear main ladder:', error);
      alert('Failed to clear ladder. Check console for details.');
      // Restore mini-game state so the user isn't unexpectedly switched
      if (wasMiniGame) dataService.setMiniGameFile(wasMiniGame);
      return;
    }

    try {
      await dataService.clearMiniGames();
      console.log('[App] Clear All: mini-games cleared');
    } catch (error) {
      console.error('[App] Clear All: failed to clear mini-games:', error);
    }

    clearSettings();
    console.log('[App] Clear All: settings cleared, reloading...');
    window.location.reload();
  };

  const handleClearMiniGames = async () => {
    try {
      await dataService.clearMiniGames();
    } catch (error) {
      console.error('Failed to clear mini-games:', error);
      alert('Failed to clear: ' + (error as Error).message);
      return;
    }
    
    setProjectName('Ladder');
    setProjectNameStorage('Ladder');
    window.location.reload();
  };

  const handleClearEmptyMiniGames = async () => {
    try {
      const result = await dataService.clearEmptyMiniGames();
      if (result.deletedCount > 0) {
        alert(`Cleared ${result.deletedCount} empty mini-game(s):\n${result.deletedFiles.join('\n')}`);
      } else {
        alert('No empty mini-games to clear.');
      }
    } catch (error) {
      console.error('Failed to clear empty mini-games:', error);
      alert('Failed to clear: ' + (error as Error).message);
      return;
    }

    setProjectName('Ladder');
    setProjectNameStorage('Ladder');
    window.location.reload();
  };

  const processNewDay = async (reRank: boolean) => {
    try {
      const players = await getPlayers();
      if (players && players.length > 0) {
        const currentTitle = getProjectName();
        const isTournament = isMiniGameTitle(currentTitle);
        
        if (isTournament) {
          try {
            const userSettings = loadUserSettings();
            const serverUrl = userSettings.server?.trim();
            
            if (serverUrl) {
              await dataService.saveMiniGameFile(currentTitle);
              console.debug(`[App] Saved mini-game file: ${currentTitle}`);
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
    console.debug(`>>> [NEW DAY TRIGGERED] reRank=${reRank}`);
    // First, trigger recalculate ratings to check for errors
    if (recalculateRef.current) {
      // Set a flag indicating New Day is pending
      setPendingNewDay({ reRank });
      console.debug(
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

  const handleExportTournamentFiles = async () => {
    try {
      const blob = await dataService.exportTournamentFiles();
      downloadBlob(blob, `${getDownloadPrefix()}_${new Date().toISOString().split('T')[0]}.zip`);
    } catch (error) {
      console.error('Failed to export tournament files:', error);
      alert('Failed to export: ' + (error as Error).message);
    }
  };

  const handleImportTournamentFiles = async () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.txt,.zip';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          const arrayBuffer = await file.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const isZip = uint8Array.length >= 4 &&
            uint8Array[0] === 0x50 && uint8Array[1] === 0x4b &&
            uint8Array[2] === 0x03 && uint8Array[3] === 0x04;
          let content: string;
          if (isZip) {
            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(arrayBuffer);
            content = '';
            const sortedFiles = Object.keys(zip.files).sort();
            for (const fileName of sortedFiles) {
              if (fileName.endsWith('/')) continue;
              const fileContent = await zip.file(fileName)?.async('string');
              if (fileContent) {
                content += `=== ${fileName} ===\n${fileContent}`;
              }
            }
          } else {
            content = new TextDecoder().decode(uint8Array);
          }
          const result = await dataService.importMiniGameFiles(content);
          const sanityIssues: string[] = [];
            if (result.imported.length > 0) {
             const firstFile = result.imported[0];
             const title = firstFile.replace('.tab', '');
             const titleMap: Record<string, string> = {
              'ladder': 'Ladder',
              'bg_game': 'BG_Game',
              'bishop_game': 'Bishop_Game',
              'pillar_game': 'Pillar_Game',
              'kings_cross': 'Kings_Cross',
              'pawn_game': 'Pawn_Game',
              'queen_game': 'Queen_Game',
              'bughouse': 'Bughouse',
            };
            const importedTitle = titleMap[firstFile] || title;
            setProjectName(importedTitle);
            setProjectNameStorage(importedTitle);

            // Post-import sanity check: compare imported mini-game against club ladder
            const miniGameFiles = result.imported.filter(f => f !== 'ladder.tab');
            if (miniGameFiles.length > 0) {
              const settings = loadUserSettings();
              const serverUrl = settings.server?.trim();
              if (serverUrl) {
                for (const mgFile of miniGameFiles) {
                  const fileIssues = await runPostImportSanityCheck(mgFile, serverUrl, settings.apiKey);
                  sanityIssues.push(...fileIssues);
                }
              }
            }
          }
          alert(`Imported: ${result.imported.join(', ')}`);
          if (result.errors.length > 0) {
            alert(`Errors: ${result.errors.join(', ')}`);
          }
          if (sanityIssues.length > 0) {
            alert(`Imported data has integrity issues:\n\n${sanityIssues.join('\n')}\n\nThis mini-game file may be from a different ladder.`);
          }
          // Force refresh to load imported data (bypasses hash guard)
          if (refreshPlayersRef.current) {
            console.debug('[IMPORT] Forcing player refresh after import');
            await refreshPlayersRef.current(true);
          }
        } catch (error) {
          console.error('Failed to import:', error);
          alert('Failed to import: ' + (error as Error).message);
        }
      };
      input.click();
    } catch (error) {
      console.error('Failed to import tournament files:', error);
      alert('Failed to import: ' + (error as Error).message);
    }
  };

  const handleImportSingleMiniGame = async () => {
    const targetGame = prompt(
      `Import .tab file into a mini-game slot.\nSelect one:\n${MINI_GAME_FILES.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\nEnter number:`
    );
    if (!targetGame) return;
    const index = parseInt(targetGame) - 1;
    if (index < 0 || index >= MINI_GAME_FILES.length) {
      alert('Invalid selection');
      return;
    }
    const selectedGame = MINI_GAME_FILES[index];

    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.tab,.xls';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        try {
          const result = await dataService.importSingleMiniGameFile(file, selectedGame);
           setProjectName(selectedGame.replace('.tab', ''));
           setProjectNameStorage(selectedGame.replace('.tab', ''));
           
            // Post-import sanity check
            const sSettings = loadUserSettings();
            const sServerUrl = sSettings.server?.trim();
            const singleSanityIssues = sServerUrl
              ? await runPostImportSanityCheck(selectedGame, sServerUrl, sSettings.apiKey)
              : [];
             alert(result.message);
            if (singleSanityIssues.length > 0) {
              alert(`Imported data has integrity issues:\n\n${singleSanityIssues.join('\n')}\n\nThis mini-game file may be from a different ladder.`);
            }
            // Force refresh to load imported data (bypasses hash guard)
            if (refreshPlayersRef.current) {
              console.debug('[IMPORT] Forcing player refresh after single import');
              await refreshPlayersRef.current(true);
            }
         } catch (error) {
          console.error('Failed to import:', error);
          alert('Failed to import: ' + (error as Error).message);
        }
      };
      input.click();
    } catch (error) {
      console.error('Failed to import single mini-game:', error);
      alert('Failed to import: ' + (error as Error).message);
    }
  };

  const handleGenerateTrophies = async () => {
    try {
      const blob = await dataService.generateTrophyReport(getDebugLevel());
      downloadBlob(blob, `${getDownloadPrefix()}-trophies_${new Date().toISOString().split('T')[0]}.tab`);
    } catch (error) {
      console.error('Failed to generate trophies:', error);
      alert('Failed to generate trophies: ' + (error as Error).message);
    }
  };

  const handleGenerateActivityReport = async () => {
    try {
      const blob = await dataService.generateActivityReport();
      downloadBlob(blob, `${getDownloadPrefix()}-activity_${new Date().toISOString().split('T')[0]}.tab`);
    } catch (error) {
      console.error('Failed to generate activity report:', error);
      alert('Failed to generate activity report: ' + (error as Error).message);
    }
  };

  const handleSaveSettingsForAction = (settings: { showRatings: boolean[]; debugLevel: number; kFactor: number }, userSettings: UserSettings) => {
    saveSettings(settings);
    saveUserSettings(userSettings);
    console.debug('[App] Settings saved silently for action.');
  };

  const handleTitleSwitch = async (newTitle: string) => {
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
    console.debug("[Reconnect] Pulling from server - merging with local changes");
    try {
      // Replay pending deletes first
      await replayPendingDeletes();
      
      // Fetch fresh data from server
      const userSettings = loadUserSettings();
      const serverUrl = userSettings.server;
      if (serverUrl) {
        const response = await gatedFetch(`${serverUrl}/api/ladder`);
        if (response.ok) {
          const data = await response.json();
          const serverPlayers = data.data?.players || [];
          
          // Get local players for merge
          const localPlayers = await getPlayers();
          
          // Simple merge: keep server as base, preserve local unconfirmed entries
          const mergedPlayers = serverPlayers.map((sp: any) => {
            const localPlayer = localPlayers.find((lp: any) => lp.rank === sp.rank);
            if (localPlayer && localPlayer.gameResults) {
              const mergedGameResults = [...(sp.gameResults || [...DEFAULT_GAME_RESULTS])];
              for (let r = 0; r < 31; r++) {
              const localResult = localPlayer.gameResults[r];
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
          
          console.debug(`[Reconnect] Pulled and merged ${serverPlayers.length} players from server`);
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
    console.debug("[Reconnect] Pushing to server - merging local changes");
    try {
      // Replay pending deletes first
      await replayPendingDeletes();
      
      // Fetch latest server state
      const userSettings = loadUserSettings();
      const serverUrl = userSettings.server;
      if (!serverUrl) {
        alert("No server URL configured.");
        return;
      }
      
      const serverResponse = await gatedFetch(`${serverUrl}/api/ladder`);
      if (!serverResponse.ok) {
        console.error("[Reconnect] Failed to fetch server state:", serverResponse.status);
        alert("Failed to fetch server state. Please try again.");
        return;
      }
      
      const serverData = await serverResponse.json();
      const serverPlayers = serverData?.players || [];
      
      // Get local players and merge with server state
      const localPlayers = await getPlayers();
      const pendingDeletes = getPendingDeletes();
      const mergedPlayers = mergeServerWithLocal(serverPlayers, localPlayers, pendingDeletes);
      
      // Save merged data to server
      const response = await gatedFetch(`${serverUrl}/api/ladder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: mergedPlayers }),
      });
      
      if (response.ok) {
        console.debug(`[Reconnect] Pushed ${mergedPlayers.length} players to server`);
        
        // Clear flags
        clearLocalChangesFlag();
        
        setShowReconnectDialog(false);
        alert("Successfully synced local changes to server!");
      } else {
        console.error("[Reconnect] Failed to push to server:", response.status);
        alert("Failed to push to server. Please try again.");
      }
    } catch (error) {
      console.error("[Reconnect] Error pushing to server:", error);
      alert("Error connecting to server. Please try again.");
    }
  };

  return (
    <>
      {urlConfigApplied && (
        <div
          onClick={() => setUrlConfigApplied(false)}
          style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '0.5rem',
            padding: '1rem 1.5rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            cursor: 'pointer',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ margin: 0, fontWeight: 600, color: '#92400e' }}>
              URL configuration applied
            </p>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#a16207' }}>
              Server settings have been saved. Open Settings to verify or edit.
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
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
        onSetToggleAdmin={(toggle) => { toggleAdminRef.current = toggle; }}
        showServerDownBlocking={showServerDownBlocking}
        onDismissServerDown={() => setShowServerDownBlocking(false)}
        versionMismatch={versionMismatch}
        setVersionMismatch={setVersionMismatch}
onTitleSwitch={handleTitleSwitch}
        testMode={testMode}
        setTestMode={setTestMode}
        onTournamentActiveChange={setMiniGamesHaveResults}

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
          onClearEmptyMiniGames={isAdmin ? handleClearEmptyMiniGames : undefined}
          onExportTournamentFiles={isAdmin ? handleExportTournamentFiles : undefined}
           onImportTournamentFiles={isAdmin ? handleImportTournamentFiles : undefined}
           onImportSingleMiniGame={isAdmin ? handleImportSingleMiniGame : undefined}
           onGenerateTrophies={isAdmin ? handleGenerateTrophies : undefined}
            onGenerateActivityReport={isAdmin ? handleGenerateActivityReport : undefined}
 miniGamesHaveResults={miniGamesHaveResults}
           isAdmin={isAdmin}
           onToggleAdmin={toggleAdminRef.current}
onSaveBeforeAction={handleSaveSettingsForAction}
           testMode={testMode}
           setTestMode={setTestMode}
         />
      )}
    </>
  );
}

function getDownloadPrefix(): string {
  const segments = window.location.pathname.split('/').filter(Boolean);
  if (segments.length > 0 && segments[0] !== 'dist') {
    return segments[0];
  }
  return window.location.hostname;
}

async function runPostImportSanityCheck(miniGameFile: string, serverUrl: string, apiKey: string | undefined): Promise<string[]> {
  const issues: string[] = [];
  let mgPlayers: any[] = [];
  let clubPlayers: any[] = [];
  try {
    const clubResp = await gatedFetch(`${serverUrl}/api/ladder`);
    if (clubResp.ok) clubPlayers = (await clubResp.json()).data?.players || [];
  } catch (_e) {}
  try {
    const mgResp = await gatedFetch(`${serverUrl}/api/admin/tournament/read-mini-game?fileName=${encodeURIComponent(miniGameFile)}`, {
      headers: { ...(apiKey ? { 'X-API-Key': apiKey } : {}) },
    });
    if (mgResp.ok) mgPlayers = (await mgResp.json()).data?.players || [];
  } catch (_e) {}
  if (mgPlayers.length === 0 || clubPlayers.length === 0) return issues;
  const dupRanks = detectDuplicateRanks(mgPlayers);
  if (dupRanks.length > 0) issues.push(`${miniGameFile}: Duplicate ranks: ${dupRanks.join(', ')}`);
  const check = validatePlayersNamesOnly(mgPlayers, clubPlayers);
  if (check.orphanRanks.length > 0) issues.push(`${miniGameFile}: Orphan ranks: ${check.orphanRanks.join(', ')}`);
  if (check.countMismatch) issues.push(`${miniGameFile}: Count mismatch: mini-game=${check.localCount}, club=${check.clubCount}`);
  if (check.diverged.length > 0) issues.push(`${miniGameFile}: Name mismatch for ${check.diverged.length} player(s): ${check.diverged.slice(0, 10).join(', ')}${check.diverged.length > 10 ? '...' : ''}`);
  return issues;
}

async function determineMode(): Promise<{ mode: DataServiceMode; serverUrl?: string }> {
  await initializeConnectionState();
  const state = getConnectionState();

  if (state.configuredForServer && state.serverUrl) {
    const serverUrl = state.serverUrl.replace(/\/$/, '');
    sessionStorage.setItem('autoDetectedServerUrl', serverUrl);
    saveUserSettings({ server: serverUrl, apiKey: loadUserSettings().apiKey });
    if (serverUrl.includes('localhost') || serverUrl.includes('127.0.0.1')) {
      return { mode: DataServiceMode.DEVELOPMENT, serverUrl };
    }
    return { mode: DataServiceMode.SERVER, serverUrl };
  }

  console.debug('[App] Using LOCAL mode (no server configured)');
  return { mode: DataServiceMode.LOCAL };
}

export default App;
