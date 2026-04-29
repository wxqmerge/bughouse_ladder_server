import { useState, useEffect, useRef } from "react";
import type {
  PlayerData,
  ValidationResult,
  MatchData,
  PlayerMatchResult,
} from "../utils/hashUtils";
import {
  processGameResults,
  calculateRatings,
  repopulateGameResults,
  updatePlayerGameData,
} from "../utils/hashUtils";
import { MINI_GAMES, processNewDayTransformations } from "../utils/constants";
import ErrorDialog from "./ErrorDialog";
import AddPlayerDialog from "./AddPlayerDialog";
import { BulkPasteDialog } from "./BulkPasteDialog";
import MenuBar from "./MenuBar";
import MobileMenu from "./MobileMenu";
import { Menu as MenuIcon, Server } from "lucide-react";
import { shouldLog } from "../utils/debug";
import { getVersionString, isLocalMode, isServerDownMode, getProgramMode, testServerConnection } from "../utils/mode";
import { log } from "../utils/log";
import { mergeServerWithLocal as _mergeServerWithLocal } from "../utils/mergeUtils";
import { loadUserSettings, saveUserSettings, saveLastWorkingConfig, normalizeServerUrl } from "../services/userSettingsStorage";
import { getKeyPrefix, startBatch, endBatch, saveToServer, clearAllSaveStatus, isCellSaved, markCellAsSaved, markLocalChanges, getHasLocalChanges, clearLocalChangesFlag, getPendingDeletes, clearPendingDeletes, queueDelete, isAdminLocked, tryAcquireAdminLock, forceAcquireAdminLock, releaseAdminLock, getAdminLockInfo, getClientId, getServerUrl } from "../services/storageService";
import {
  getPlayers,
  savePlayers,
  getSettings,
  saveSettings,
  getProjectName,
  setProjectName as setProjectNameStorage,
  getZoomLevel,
  setZoomLevel as setZoomLevelStorage,
} from "../services/storageService";
import RestoreBackupDialog from "./RestoreBackupDialog";
import PreviewDialog from "./PreviewDialog";
import DeleteHiddenPlayerDialog from "./DeleteHiddenPlayerDialog";
import "../css/index.css";

export const loadSampleData = () => {
  const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

  const firstNames = [
    "John",
    "Jane",
    "Robert",
    "Emily",
    "Michael",
    "Sarah",
    "David",
    "Lisa",
    "James",
    "Anna",
    "Thomas",
    "Maria",
    "Daniel",
    "Jennifer",
  ];

  const lastNames = [
    "Johnson",
    "Smith",
    "Williams",
    "Brown",
    "Davis",
    "Garcia",
    "Miller",
    "Wilson",
    "Moore",
    "Taylor",
    "Anderson",
    "Thomas",
    "Jackson",
    "White",
  ];

  const groupCodes = ["A1", "B", "C", "D", "E", ""];

  // Fixed permutation for consistent sample data
  const shuffledRanks = [7, 2, 14, 5, 10, 1, 13, 8, 3, 12, 6, 11, 4, 9];

  const pseudoRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  const getRandomRank = (
    min: number,
    max: number,
    excluded: number[],
    seed: number,
  ) => {
    const candidates = [];
    for (let i = min; i <= max; i++) {
      if (!excluded.includes(i)) candidates.push(i);
    }
    if (candidates.length === 0) return 1;
    const idx = Math.floor(pseudoRandom(seed) * candidates.length);
    return candidates[idx];
  };

  return ranks.map((rank: number) => {
    const index = shuffledRanks.indexOf(rank);
    const pseudoRandom2 = (seed: number) => pseudoRandom(seed + index * 100);

    // Random number of games (2-5 rounds)
    const numGames = 2 + Math.floor(pseudoRandom2(index * 10) * 4);
    const gameResults: (string | null)[] = Array(31).fill(null);

    const excluded: number[] = [];

    for (let i = 0; i < numGames; i++) {
      // Randomly choose 2-player or 4-player game
      const is4Player = pseudoRandom2(index * 10 + i * 3) > 0.5;

      // Generate opponent ranks (avoid duplicates)
      const opp1 = getRandomRank(1, 14, excluded, index * 10 + i * 5);
      excluded.push(opp1);

      if (is4Player) {
        // 4-player: need 3 more opponents (players 2, 3, 4)
        const opp2 = getRandomRank(1, 14, excluded, index * 10 + i * 7);
        excluded.push(opp2);

        const opp3 = getRandomRank(1, 14, excluded, index * 10 + i * 9);
        excluded.push(opp3);

        const opp4 = getRandomRank(1, 14, excluded, index * 10 + i * 10);
        excluded.push(opp4);

        // Generate result (W, L, or D) for each pair
        // Format: opp1:opp2Wopp3:opp4 (first pair vs second pair)
        const result1 = ["W", "L", "D"][
          Math.floor(pseudoRandom2(index * 10 + i * 11) * 3)
        ];
        const result2 = ["W", "L", "D"][
          Math.floor(pseudoRandom2(index * 10 + i * 13) * 3)
        ];

        gameResults[i] = `${opp1}:${opp2}${result1}${result2}${opp3}:${opp4}`;
      } else {
        const opp2 = getRandomRank(1, 14, excluded, index * 10 + i * 7);
        excluded.push(opp2);

        // Generate result
        const result = ["W", "L", "D"][
          Math.floor(pseudoRandom2(index * 10 + i * 11) * 3)
        ];
        gameResults[i] = `${opp1}${result}${opp2}`;
      }
    }

    return {
      rank,
      group: groupCodes[index % groupCodes.length],
      lastName: lastNames[index],
      firstName: firstNames[index],
      rating: 1000 + Math.floor(pseudoRandom2(index * 17) * 400),
      nRating: 1000 + Math.floor(pseudoRandom2(index * 31) * 400),
      trophyEligible: true,
      grade: `${(index % 7) + 1}th`,
      num_games: numGames,
      attendance: numGames,
      info: "",
      phone: "",
      school: "",
      room: "",
      gameResults,
    };
  });
};

interface LadderFormProps {
  setShowSettings?: (show: boolean) => void;
  triggerWalkthrough?: boolean;
  setTriggerWalkthrough?: (show: boolean) => void;
  onSetRecalculateRef?: (ref: () => void) => void;
  onSetRefreshPlayersRef?: (ref: () => void) => void;
  onAdminChange?: (isAdmin: boolean) => void;
  showServerDownBlocking?: boolean;
  onDismissServerDown?: () => void;
  versionMismatch?: boolean;
  setVersionMismatch?: (v: boolean) => void;
}

export default function LadderForm({
  setShowSettings,
  triggerWalkthrough,
  setTriggerWalkthrough,
  onSetRecalculateRef,
  onSetRefreshPlayersRef,
  onAdminChange,
  showServerDownBlocking = false,
  onDismissServerDown,
  versionMismatch = false,
  setVersionMismatch,
}: LadderFormProps = {}) {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [zoomLevel, setZoomLevel] = useState<
    "50%" | "70%" | "100%" | "140%" | "200%"
  >("100%");
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      const saved = localStorage.getItem(getKeyPrefix() + 'ladder_admin_mode');
      return saved === 'true';
    } catch {
      return false;
    }
  });
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [overrideLockHolder, setOverrideLockHolder] = useState<string | null>(null);
  const [overrideTimeout, setOverrideTimeout] = useState<number>(0);
  const [showVersionWarningDialog, setShowVersionWarningDialog] = useState(false);
  const [serverVersion, setServerVersion] = useState<string>('');
  const [writeErrors, setWriteErrors] = useState<{ count: number; message: string } | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<
    "rank" | "nRating" | "rating" | "byLastName" | "byFirstName" | null
  >(null);
  const [projectName, setProjectName] = useState<string>(
    "Bughouse Chess Ladder",
  );
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [emptyPlayerRow, setEmptyPlayerRow] = useState<{
    firstName: string;
    lastName: string;
    group: string;
    rating: number;
    nRating: number;
    trophyEligible: boolean;
    grade: string;
    num_games: number;
    attendance: number;
    phone: string;
    info: string;
    school: string;
    room: string;
    gameResults: (string | null)[];
  }>({
    firstName: "",
    lastName: "",
    group: "",
    rating: 0,
    nRating: 0,
    trophyEligible: true,
    grade: "",
    num_games: 0,
    attendance: 0,
    phone: "",
    info: "",
    school: "",
    room: "",
    gameResults: new Array(31).fill(null),
  });
  const emptyPlayerRowRef = useRef(emptyPlayerRow);
  emptyPlayerRowRef.current = emptyPlayerRow;
  const [currentError, setCurrentError] = useState<ValidationResult | null>(
    null,
  );
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isWalkthrough, setIsWalkthrough] = useState(false);
  const [walkthroughErrors, setWalkthroughErrors] = useState<
    ValidationResult[]
  >([]);
  const [walkthroughIndex, setWalkthroughIndex] = useState<number>(0);
  const [pendingPlayers, setPendingPlayers] = useState<PlayerData[] | null>(
    null,
  );
  const [pendingMatches, setPendingMatches] = useState<any[] | null>(null);
  const [pendingPlayerResultsByMatch, setPendingPlayerResultsByMatch] =
    useState<Map<string, PlayerMatchResult[]> | null>(null);

  const [entryCell, setEntryCell] = useState<{
    playerRank: number;
    round: number;
  } | null>(null);
  const [tempGameResult, setTempGameResult] = useState<{
    playerRank: number;
    round: number;
    resultString: string;
    parsedPlayer1Rank: number;
    parsedPlayer2Rank: number;
  } | null>(null);
  const [isAddPlayerDialogOpen, setIsAddPlayerDialogOpen] = useState(false);
  const [showBulkPasteDialog, setShowBulkPasteDialog] = useState(false);
  const [showRestoreBackupDialog, setShowRestoreBackupDialog] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    players: PlayerData[];
    filename: string;
    playerCount: number;
    totalRoundsFilled: number;
    totalGamesPlayed: number;
  } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{
    players: PlayerData[];
    backupFilename: string;
  } | null>(null);
  const [currentMode, setCurrentMode] = useState<'local' | 'server_down' | 'server'>('local');
  const [debugMode, setDebugMode] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // Enter Games mode state
  const [enterGamesError, setEnterGamesError] = useState<ValidationResult | null>(null);
  const [isEnterGamesMode, setIsEnterGamesMode] = useState(false);
  // Splash screen server configuration state
  const [splashServerUrl, setSplashServerUrl] = useState('');
  const [splashApiKey, setSplashApiKey] = useState('');
  const [hadExistingUserSettings, setHadExistingUserSettings] = useState(false);
  const [hasLocalPlayerData, setHasLocalPlayerData] = useState(false);
  const [isRetryingConnection, setIsRetryingConnection] = useState(false);
  const [retryErrorMessage, setRetryErrorMessage] = useState<string | null>(null);
  const [showDeleteHiddenDialog, setShowDeleteHiddenDialog] = useState(false);
  const [hiddenPlayersToDelete, setHiddenPlayersToDelete] = useState<PlayerData[]>([]);
  const [currentDeleteIndex, setCurrentDeleteIndex] = useState(0);
  const [deleteAllPlayers, setDeleteAllPlayers] = useState(false);
  const [rankLoadErrors, setRankLoadErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const latestPendingPlayersRef = useRef<PlayerData[] | null>(null);

  useEffect(() => {
    if (triggerWalkthrough && setTriggerWalkthrough) {
      setTriggerWalkthrough(false);
      setIsWalkthrough(true);
      // Reset isRecalculating when starting walkthrough
      setIsRecalculating(false);
      setWalkthroughIndex(0);
      // Set entryCell to first non-blank cell for highlighting
      const cells = getNonBlankCells();
      if (cells.length > 0) {
        setEntryCell({
          playerRank: cells[0].playerRank,
          round: cells[0].round,
        });
      }
    }
  }, [triggerWalkthrough, setTriggerWalkthrough]);

  // Initialize splash screen state from localStorage
  useEffect(() => {
    try {
      // Check for pending remote file load
      const pendingFileLoad = sessionStorage.getItem('pendingFileLoad');
      if (pendingFileLoad === 'true') {
        const encodedContent = sessionStorage.getItem('pendingFileContent');
        const fileName = sessionStorage.getItem('pendingFileName') || 'ladder';
        
        if (encodedContent) {
          const text = decodeURIComponent(escape(atob(encodedContent)));
          const blob = new Blob([text], { type: 'text/tab-separated-values' });
          const file = new File([blob], fileName, { type: 'text/tab-separated-values' });
          
          sessionStorage.removeItem('pendingFileLoad');
          sessionStorage.removeItem('pendingFileContent');
          sessionStorage.removeItem('pendingFileName');
          
          setLastFile(file);
          loadPlayers(file);
          return;
        }
      }
      
      // Check for user settings
      const userSettingsJson = localStorage.getItem('bughouse-ladder-user-settings');
      if (userSettingsJson) {
        const userSettings = JSON.parse(userSettingsJson);
        setSplashServerUrl(normalizeServerUrl(userSettings.server) || '');
        setSplashApiKey(userSettings.apiKey || '');
        setHadExistingUserSettings(true);
      }
      
      // Check for local player data
      const prefix = getKeyPrefix();
      const localData = localStorage.getItem(prefix + 'ladder_players');
      const hasLocalPlayers = !!(localData && JSON.parse(localData).length > 0);
      setHasLocalPlayerData(hasLocalPlayers);
    } catch (error) {
      console.error('Failed to load localStorage for splash:', error);
    }
  }, []);

  // Re-acquire admin lock on init (if previously in admin mode)
  useEffect(() => {
    if (!isAdmin) return;
    
    const serverUrl = getServerUrl();
    if (!serverUrl) {
      // Local mode - already in admin mode, no lock needed
      return;
    }
    
    // Server mode - try to re-acquire the lock
    const reacquireAdminLock = async () => {
      try {
        const acquired = await tryAcquireAdminLock();
        if (!acquired) {
          // Check if another user holds the lock
          const lockInfo = await getAdminLockInfo();
          if (lockInfo.serverReachable === false) {
            // Server unreachable - fall back to user mode
            console.warn('[ADMIN_LOCK] Server unreachable, falling back to user mode');
            setIsAdmin(false);
            return;
          }
          
          if (lockInfo.locked && lockInfo.holderId !== getClientId()) {
            // Another user holds it - show override dialog
            setOverrideLockHolder(lockInfo.holderName || "Another user");
            setOverrideTimeout(Math.ceil((lockInfo.expiresAt! - Date.now()) / 1000));
            setShowOverrideDialog(true);
          } else {
            // Lock expired or no lock held - fall back to user mode
            console.warn('[ADMIN_LOCK] Could not re-acquire lock, falling back to user mode');
            setIsAdmin(false);
          }
        }
      } catch (err) {
        console.error('[ADMIN_LOCK] Failed to re-acquire lock:', err);
        setIsAdmin(false);
      }
    };
    
    reacquireAdminLock();
  }, []); // Run once on init

  // Track mode changes for UI updates
  useEffect(() => {
    const updateMode = () => {
      const mode = getProgramMode();
      if (mode === 'local' || mode === 'server_down') {
        setCurrentMode(mode);
      } else {
        setCurrentMode('server');
      }
    };
    
    updateMode();
    const interval = setInterval(updateMode, 10000); // Check every 10 seconds
    
    return () => clearInterval(interval);
  }, []);

  // Admin lock: Release lock on unmount when exiting admin mode
  useEffect(() => {
    return () => {
      if (isAdmin) {
        releaseAdminLock().catch(err => console.error('[ADMIN_LOCK] Failed to release lock:', err));
      }
    };
  }, [isAdmin]);

  // Notify parent of admin state changes
  useEffect(() => {
    onAdminChange?.(isAdmin);
  }, [isAdmin, onAdminChange]);

  // Persist admin mode to localStorage
  useEffect(() => {
    localStorage.setItem(getKeyPrefix() + 'ladder_admin_mode', JSON.stringify(isAdmin));
  }, [isAdmin]);

  // Override dialog: Timer countdown
  useEffect(() => {
    if (!showOverrideDialog || overrideTimeout <= 0) return;
    
    const timer = setInterval(() => {
      setOverrideTimeout(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [showOverrideDialog, overrideTimeout]);

  // VB6 Line: 894 - Initialize with storage data or sample data
  useEffect(() => {
    const initializeData = async () => {
      try {
        // Get server configuration
        const userSettingsJson = localStorage.getItem('bughouse-ladder-user-settings');
        let serverUrl = '';
        if (userSettingsJson) {
          const userSettings = JSON.parse(userSettingsJson);
          serverUrl = userSettings.server?.trim() || '';
        }

        console.log('[INIT]', 'Server URL:', serverUrl || '(none)');

        // Load project settings from localStorage
        const projectName = getProjectName();
        if (projectName) {
          setProjectName(projectName);
        }

        const zoomLevel = getZoomLevel();
        if (zoomLevel) {
          const zoomPercent = `${zoomLevel}%` as
            | "50%"
            | "70%"
            | "100%"
            | "140%"
            | "200%";
          setZoomLevel(zoomPercent);
        }

        // Load debug mode from user settings
        const userSettings = loadUserSettings();
        setDebugMode(userSettings.debugMode || false);

        // PRIORITY 1: If server is configured, ALWAYS fetch from server first
        if (serverUrl) {
          console.log('[INIT]', 'Fetching from server:', serverUrl);
          (window as any).__ladder_setStatus?.(`Connecting to ${serverUrl}...`);
          try {
            const response = await fetch(`${serverUrl}/api/ladder`, {
              headers: {},
            });
            
            if (response.ok) {
              // Save this as the last working config
              saveLastWorkingConfig(serverUrl, splashApiKey);
              
              const data = await response.json();
              const serverPlayers = data.data?.players || [];
              
              console.log('[INIT]', 'Server returned', serverPlayers.length, 'players');
              
              // Debug: Log game results for players 5 and 6
              const player5 = serverPlayers.find((p: PlayerData) => p.rank === 5);
              const player6 = serverPlayers.find((p: PlayerData) => p.rank === 6);
              if (player5) {
                const filledCells = player5.gameResults?.map((r: string | null, i: number) => r ? `R${i+1}:${r}` : null).filter(Boolean) || [];
                console.log('[INIT CLIENT]', `Player 5 game results:`, filledCells.slice(0, 5), filledCells.length > 5 ? '...' : '');
                // Check for underscores
                const hasUnderscore = filledCells.some((c: string) => c.includes('_'));
                console.log('[INIT CLIENT]', `Player 5 has underscore:`, hasUnderscore);
              }
              if (player6) {
                const filledCells = player6.gameResults?.map((r: string | null, i: number) => r ? `R${i+1}:${r}` : null).filter(Boolean) || [];
                console.log('[INIT CLIENT]', `Player 6 game results:`, filledCells.slice(0, 5), filledCells.length > 5 ? '...' : '');
                const hasUnderscore = filledCells.some((c: string) => c.includes('_'));
                console.log('[INIT CLIENT]', `Player 6 has underscore:`, hasUnderscore);
              }
              
              if (serverPlayers && serverPlayers.length > 0) {
                (window as any).__ladder_setStatus?.(`Loaded ${serverPlayers.length} players from server`);
                const playersWithResults = serverPlayers.map((player: PlayerData) => ({
                  ...player,
                  gameResults: player.gameResults || new Array(31).fill(null),
                }));
                
                // Mark cells as saved if they have underscores
                playersWithResults.forEach((player: PlayerData) => {
                  player.gameResults?.forEach((result: string | null, round: number) => {
                    if (result && result.endsWith('_')) {
                      markCellAsSaved(player.rank, round);
                    }
                  });
                });
                
                setPlayers(playersWithResults);
                setSortBy(null);
                console.log('[LadderForm]', `Loaded ${playersWithResults.length} players from server`);
                (window as any).__ladder_setStatus?.(null);
                return;
              }
            }
            
            // Server returned empty or error - log but continue to localStorage fallback
            console.warn('[INIT]', 'Server fetch failed or empty, falling back to localStorage');
          } catch (err) {
            console.warn('[INIT]', 'Failed to fetch from server, falling back to localStorage:', err);
          }
        }

        // PRIORITY 2: Fall back to localStorage if no server or server failed
        const prefix = getKeyPrefix();
        const localData = localStorage.getItem(prefix + 'ladder_players');
        
        console.log('[INIT]', 'localStorage has data:', !!localData);

        const playersJson = localData;
        if (playersJson) {
          try {
            const players: PlayerData[] = JSON.parse(playersJson);
            console.log('[INIT]', 'Parsed', players.length, 'players from localStorage');
            
            if (players.length > 0) {
              const playersWithResults = players.map((player) => ({
                ...player,
                gameResults: player.gameResults || new Array(31).fill(null),
              }));
              setPlayers(playersWithResults);
              setSortBy(null);
              if (shouldLog(10)) {
                console.log(
                  `[LadderForm] Loaded ${playersWithResults.length} players from localStorage`,
                );
              }
              return;
            }
          } catch (parseErr) {
            console.error('[INIT]', 'Failed to parse localStorage:', parseErr);
          }
        }

        // Load settings
        const settings = getSettings();
        if (settings) {
          console.log(`[LadderForm] Loaded settings from storage:`, settings);
        }
      } catch (err) {
        console.error("[INIT] Failed to load from storage:", err);
      }

      // No data anywhere - start with empty ladder
      console.log('[INIT]', 'Starting with empty ladder');
      (window as any).__ladder_setStatus?.('Starting with empty ladder...');
      setPlayers([]);
      setSortBy(null);
      (window as any).__ladder_setStatus?.(null);
    };

    initializeData();
  }, []);

 const loadPlayers = (file?: File) => {
    const fileToLoad = file || lastFile;

    if (!fileToLoad) {
      return;
    }

    if (shouldLog(10)) {
      console.log(`[LadderForm] Loading file: ${fileToLoad.name}`);
    }
    const projectName = fileToLoad.name.replace(/\.[^.]+$/, "");
    console.log(
      `>>> [LOAD FILE] Setting title from filename: "${projectName}"`,
    );
    setProjectName(projectName);
    localStorage.setItem(
      getKeyPrefix() + "ladder_project_name",
      projectName,
    );
    setLastFile(fileToLoad);
    setSortBy(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n");
      let loadedPlayers: PlayerData[] = [];
      const allGameResults: (string | null)[][] = [];
      const numRounds = 31;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trimEnd();

        if (!line) continue;

        if (line.startsWith("Group")) {
          // Validate header Round 1 column
          const headerCols = line.split("\t");
          if (headerCols[13] && headerCols[13].trim() !== "1") {
            alert(`Warning: Header Round 1 column contains "${headerCols[13]}" instead of "1". The file may be corrupted, have missing columns, or have been edited incorrectly. Please verify the data carefully.`);
          }
          continue;
        }

        let cols = line.split("\t");
        if (cols[0].length > 2) {
          // if (line.startsWith('\t')){
          //             console.log('adding leading space to line:', line);
          cols.unshift(" ");
        }
        //if (parts.length < 14) continue;  // Need at least columns 0-13

        // const lastChar = cols[cols.length - 1];
        // const hasTail = lastChar === '' ? cols.length - 1 : cols.length;

        const ratingStr = String(cols[3] || "").trim();
        const isNegRating = ratingStr.startsWith("-");
        const nRateStr = String(cols[5] || "").trim();

        const player: PlayerData = {
          rank: cols[4] ? parseInt(cols[4]) : 0,
          group: cols[0] && cols[0].trim() !== "" ? cols[0].trim() : "",
          lastName: cols[1] !== null ? cols[1] : "",
          firstName: cols[2] !== null ? cols[2] : "",
          rating: Math.abs(parseInt(ratingStr)) || 0,
          nRating: Math.abs(parseInt(nRateStr)) || 0,
          trophyEligible: !isNegRating,
          grade: cols[6] !== null ? cols[6] : "N/A",
          num_games:
            cols[7] !== null && !isNaN(parseInt(cols[7]))
              ? parseInt(cols[7])
              : 0,
          attendance:
            cols[8] !== null && !isNaN(parseInt(cols[8]))
              ? parseInt(cols[8])
              : 0,
          phone: cols[9] !== null ? cols[9] : "",
          info: cols[10] !== null ? cols[10] : "",
          school: cols[11] !== null ? cols[11] : "",
          room: cols[12] !== null ? cols[12] : "",
          gameResults: [],
        };

        if (
          parseInt(String(player.rank)) > 0 &&
          (player.lastName || player.firstName || player.nRating !== 0)
        ) {
          loadedPlayers.push(player);
        }

        const gameResults: (string | null)[] = [];
        for (let g = 0; g < numRounds; g++) {
          gameResults.push(cols[13 + g]);
        }
        player.gameResults = gameResults;
      }

      // Max 200 players limit
      if (loadedPlayers.length > 200) {
        loadedPlayers = loadedPlayers.slice(0, 200);
      }

      if (loadedPlayers.length > 0) {
        const numRounds = 31;
        const keysToRemove = [
          getKeyPrefix() + "ladder_players",
          getKeyPrefix() + "ladder_project_name",
          getKeyPrefix() + "ladder_settings",
          getKeyPrefix() + "ladder_saved_cells",
          getKeyPrefix() + "ladder_zoom_level",
          "ladder_ladder_players",
          "ladder_server_ladder_players",
        ];
        keysToRemove.forEach((k) => localStorage.removeItem(k));

        if (sortBy === "rank") {
          loadedPlayers.sort((a, b) => a.rank - b.rank);
        } else if (sortBy === "nRating") {
          loadedPlayers.sort((a, b) => {
            // Pseudo-rating: eligible = nRating, ineligible = -nRating
            // Descending: highest + first, then lowest - first
            const pseudoA = a.trophyEligible !== false ? (a.nRating || 0) : -(a.nRating || 0);
            const pseudoB = b.trophyEligible !== false ? (b.nRating || 0) : -(b.nRating || 0);
            if (pseudoA !== pseudoB) return pseudoB - pseudoA;
            return a.rank - b.rank;
          });
        } else if (sortBy === "rating") {
          loadedPlayers.sort((a, b) => {
            // Pseudo-rating: eligible = rating, ineligible = -rating
            // Descending: highest + first, then lowest - first
            const pseudoA = a.trophyEligible !== false ? (a.rating || 0) : -(a.rating || 0);
            const pseudoB = b.trophyEligible !== false ? (b.rating || 0) : -(b.rating || 0);
            if (pseudoA !== pseudoB) return pseudoB - pseudoA;
            return a.rank - b.rank;
          });
        } else if (sortBy === "byLastName") {
          loadedPlayers.sort((a, b) => Chess_Compare(a, b, "last", 0));
        } else if (sortBy === "byFirstName") {
          loadedPlayers.sort((a, b) => Chess_Compare(a, b, "first", 0));
        }

        const sortedGameResults: (string | null)[][] = [];

        loadedPlayers.forEach((player) => {
          const gameResults: (string | null)[] = [];
          for (let g = 0; g < numRounds; g++) {
            gameResults.push(allGameResults[player.rank - 1]?.[g] ?? null);
          }
          const playerIndex = loadedPlayers.indexOf(player);
          sortedGameResults[playerIndex] = gameResults;
        });

     const totalRoundsFilled = loadedPlayers.reduce((sum, p) => 
        sum + (p.gameResults || []).filter(r => r && r.trim() !== '').length, 0
      );
      const totalGamesPlayed = Math.floor(totalRoundsFilled / 2);

      localStorage.setItem(
          getKeyPrefix() + "ladder_players",
          JSON.stringify(loadedPlayers),
        );

        if (isAdmin) {
          log('[LOAD_FILE]', 'Admin mode - showing import confirmation');
          const { blockingErrors, warnings } = checkPlayerRanks(loadedPlayers);
          const allErrors = [...blockingErrors, ...warnings];
          if (allErrors.length > 0) {
            log('[LOAD_FILE]', '⚠ Rank issues found:', allErrors);
            setRankLoadErrors(allErrors);
          } else {
            setRankLoadErrors([]);
          }
          setPendingImport({
            players: loadedPlayers,
            filename: projectName,
            playerCount: loadedPlayers.length,
            totalRoundsFilled,
            totalGamesPlayed,
          });
        } else {
          setPlayers(loadedPlayers);
          setSortBy(null);
        }
      } else {
      }
    };

    reader.readAsText(fileToLoad);
  };

  const handleConfirmImport = async () => {
    if (!pendingImport) return;
    
    log('[LOAD_FILE]', 'Admin mode - accepting import: ' + pendingImport.filename);
    setPlayers(pendingImport.players);
    setPendingImport(null);
    setRankLoadErrors([]);
    
    (window as any).__ladder_setStatus?.('Saving to server...');
    try {
      await savePlayers(pendingImport.players, true);
      log('[LOAD_FILE]', '✓ Import saved to server');
      (window as any).__ladder_setStatus?.(null);
    } catch (err) {
      log('[LOAD_FILE]', '✗ Failed to save import:', err);
      (window as any).__ladder_setStatus?.('Failed to save to server');
      setTimeout(() => (window as any).__ladder_setStatus?.(null), 3000);
    }
  };

  const handleDeclineImport = async () => {
    log('[LOAD_FILE]', 'Admin mode - declined import: ' + pendingImport?.filename);
    setPendingImport(null);
    setRankLoadErrors([]);
    
    (window as any).__ladder_setStatus?.('Restoring from server...');
    try {
      const userSettings = loadUserSettings();
      const serverUrl = userSettings.server?.trim();
      
      if (serverUrl) {
        const response = await fetch(`${serverUrl}/api/ladder`, {
          headers: {},
        });
        
        if (response.ok) {
          const data = await response.json();
          const serverPlayers = data.data?.players || [];
          
          if (serverPlayers && serverPlayers.length > 0) {
            setPlayers(serverPlayers.map((p: PlayerData) => ({
              ...p,
              gameResults: p.gameResults || new Array(31).fill(null),
            })));
            log('[LOAD_FILE]', '✓ Restored from server');
          } else {
            log('[LOAD_FILE]', '⚠ Server returned empty data after decline');
          }
        } else {
          log('[LOAD_FILE]', '⚠ Failed to restore from server (status ' + response.status + ')');
        }
      }
    } catch (err) {
      log('[LOAD_FILE]', '✗ Failed to restore from server:', err);
    }
    
    (window as any).__ladder_setStatus?.(null);
  };

  const handleRestoreBackup = async (filename: string) => {
    console.log('[RESTORE_BACKUP]', 'Selected backup:', filename);
    setShowRestoreBackupDialog(false);
    
    (window as any).__ladder_setStatus?.('Restoring from backup...');
    try {
      const userSettings = loadUserSettings();
      const serverUrl = userSettings.server?.trim();
      
      if (serverUrl) {
        // Restore the backup on server first
        const restoreResponse = await fetch(`${serverUrl}/api/admin/backups/restore/${encodeURIComponent(filename)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        
        if (!restoreResponse.ok) {
          throw new Error(`HTTP ${restoreResponse.status}`);
        }
        
        // Fetch the restored data to show preview
        const response = await fetch(`${serverUrl}/api/ladder`, {
          headers: {},
        });
        
        if (response.ok) {
          const data = await response.json();
          const serverPlayers = data.data?.players || [];
          
          if (serverPlayers && serverPlayers.length > 0) {
            const restoredPlayers = serverPlayers.map((p: PlayerData) => ({
              ...p,
              gameResults: p.gameResults || new Array(31).fill(null),
            }));
            log('[RESTORE_BACKUP]', '✓ Backup data loaded for preview');
            
            if (isAdmin) {
              setPendingRestore({
                players: restoredPlayers,
                backupFilename: filename,
              });
            } else {
              setPlayers(restoredPlayers);
              await savePlayers(restoredPlayers, true);
              log('[RESTORE_BACKUP]', '✓ Backup applied and saved (user mode)');
            }
          } else {
            log('[RESTORE_BACKUP]', '⚠ Server returned empty data after restore');
          }
        } else {
          log('[RESTORE_BACKUP]', '⚠ Failed to fetch ladder data (status ' + response.status + ')');
        }
      }
    } catch (err) {
      log('[RESTORE_BACKUP]', '✗ Failed to restore backup:', err);
      (window as any).__ladder_setStatus?.('Failed to restore from backup');
      setTimeout(() => (window as any).__ladder_setStatus?.(null), 3000);
    } finally {
      (window as any).__ladder_setStatus?.(null);
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore) return;
    
    log('[RESTORE_BACKUP]', 'Admin mode - confirming restore: ' + pendingRestore.backupFilename);
    setPlayers(pendingRestore.players);
    setPendingRestore(null);
    
    (window as any).__ladder_setStatus?.('Saving backup to server...');
    try {
      await savePlayers(pendingRestore.players, true);
      log('[RESTORE_BACKUP]', '✓ Backup restore confirmed and saved');
      (window as any).__ladder_setStatus?.(null);
    } catch (err) {
      log('[RESTORE_BACKUP]', '✗ Failed to save backup restore:', err);
      (window as any).__ladder_setStatus?.('Failed to save to server');
      setTimeout(() => (window as any).__ladder_setStatus?.(null), 3000);
    }
  };

  const handleDeclineRestore = () => {
    log('[RESTORE_BACKUP]', 'Admin mode - declined restore: ' + pendingRestore?.backupFilename);
    setPendingRestore(null);
    setShowRestoreBackupDialog(true);
    (window as any).__ladder_setStatus?.(null);
  };

  const checkPlayerRanks = (playersList: PlayerData[]): { blockingErrors: string[], warnings: string[] } => {
    const blockingErrors: string[] = [];
    const warnings: string[] = [];
    if (playersList.length === 0) return { blockingErrors, warnings };
    
    const ranks = playersList.map(p => p.rank).sort((a, b) => a - b);
    const rankSet = new Set(ranks);
    
    // Check for duplicates (blocking)
    if (rankSet.size !== ranks.length) {
      const duplicates = ranks.filter((r, i) => ranks.indexOf(r) !== i);
      const uniqueDups = [...new Set(duplicates)];
      blockingErrors.push(`Duplicate ranks found: ${uniqueDups.join(', ')}`);
    }
    
    // Check for gaps (warning)
    const maxRank = ranks[ranks.length - 1];
    const expectedRanks = new Set(Array.from({ length: maxRank }, (_, i) => i + 1));
    const missing = ranks.filter(r => !expectedRanks.has(r));
    if (missing.length > 0) {
      warnings.push(`Missing ranks: ${missing.join(', ')}`);
    }
    
    return { blockingErrors, warnings };
  };

  const fixPlayerRanks = (playersList: PlayerData[]): PlayerData[] => {
    const deduped = new Map<number, PlayerData>();
    for (const p of playersList) {
      if (!deduped.has(p.rank)) {
        deduped.set(p.rank, p);
      }
    }
    const sorted = [...deduped.values()].sort((a, b) => {
      const ratingA = a.rating || 0;
      const ratingB = b.rating || 0;
      if (ratingA !== ratingB) return ratingB - ratingA;
      return a.rank - b.rank;
    });
    return sorted.map((player, index) => ({
      ...player,
      rank: index + 1,
    }));
  };

  const checkGameErrors = (): {
    hasErrors: boolean;
    matches: MatchData[];
    errors: ValidationResult[];
    errorCount: number;
    playerResultsByMatch?: Map<string, any[]>;
    rankBlockingErrors?: string[];
    rankWarnings?: string[];
  } => {
    return checkGameErrorsWithPlayers(players);
  };

  const checkGameErrorsWithPlayers = (playersList: PlayerData[]): {
    hasErrors: boolean;
    matches: MatchData[];
    errors: ValidationResult[];
    errorCount: number;
    playerResultsByMatch?: Map<string, any[]>;
    rankBlockingErrors?: string[];
    rankWarnings?: string[];
  } => {
    if (playersList.length === 0) {
      console.error("No players to process");
      return { hasErrors: false, matches: [], errors: [], errorCount: 0 };
    }

    const { blockingErrors, warnings } = checkPlayerRanks(playersList);
    
    const { matches, hasErrors, errorCount, errors, playerResultsByMatch } =
      processGameResults(playersList, 31);
    if (shouldLog(4)) {
      console.log(`Validated ${matches.length} matches, errors: ${errorCount}`);
    }

    if (blockingErrors.length > 0 || warnings.length > 0 || (hasErrors && errors.length > 0)) {
      if (blockingErrors.length > 0) {
        console.warn("Rank blocking errors detected:", blockingErrors);
      }
      if (warnings.length > 0) {
        console.warn("Rank warnings:", warnings);
      }
      if (hasErrors && errors.length > 0) {
        console.warn("Game errors detected. Opening dialog for correction.");
        setIsRecalculating(true);
        setPendingPlayers(playersList);
        setPendingMatches(matches);
        setPendingPlayerResultsByMatch(playerResultsByMatch);
        setCurrentError(errors[0]);
        setEntryCell({
          playerRank: errors[0].playerRank,
          round: errors[0].resultIndex,
        });
        setWalkthroughErrors(errors);
        setWalkthroughIndex(0);
      }
    }

    return { hasErrors, matches, errors, errorCount, playerResultsByMatch, rankBlockingErrors: blockingErrors.length > 0 ? blockingErrors : undefined, rankWarnings: warnings.length > 0 ? warnings : undefined };
  };

  /**
   * Merge server players with local changes
   * Preserves: local unconfirmed entries, pending deletes
   */
  const mergeServerWithLocal = (
    serverPlayers: PlayerData[],
    localPlayers: PlayerData[]
  ): PlayerData[] => {
    const pendingDeletes = getPendingDeletes();
    return _mergeServerWithLocal(serverPlayers, localPlayers, pendingDeletes);
  };

  // Enter Games mode handlers
  const handleEnterGamesMenu = () => {
    console.log(">>> [MENU ACTION] Enter Games");
    
    // Exit admin mode if currently in it
    if (isAdmin) {
      console.log(">>> [ENTER_GAMES] Exiting admin mode");
      setIsAdmin(false);
    }
    
    setIsEnterGamesMode(true);
    // Find first empty cell
    for (let rank = 1; rank <= players.length; rank++) {
      const player = players.find(p => p.rank === rank);
      if (!player) continue;
      for (let round = 0; round < 31; round++) {
        const cellValue = player.gameResults?.[round];
        if (!cellValue || cellValue.trim() === "") {
          setEntryCell({ playerRank: rank, round });
          return;
        }
      }
    }
    // No empty cells found
    alert("No empty cells available for game entry.");
    setIsEnterGamesMode(false);
  };

  /**
   * Find the next empty cell after a given position
   * @returns { playerRank, round } or null if no more empty cells
   */
  const findNextEmptyCell = (startRank: number, startRound: number): { playerRank: number; round: number } | null => {
    // Search from the cell after the current one
    for (let rank = startRank; rank <= players.length; rank++) {
      const player = players.find(p => p.rank === rank);
      if (!player) continue;
      
      // If this is the starting rank, start from next round; otherwise start from round 0
      const startR = rank === startRank ? startRound + 1 : 0;
      
      for (let round = startR; round < 31; round++) {
        const cellValue = player.gameResults?.[round];
        if (!cellValue || cellValue.trim() === "") {
          return { playerRank: rank, round };
        }
      }
    }
    
    // If no more cells found from current position, search from beginning
    for (let rank = 1; rank < startRank; rank++) {
      const player = players.find(p => p.rank === rank);
      if (!player) continue;
      
      for (let round = 0; round < 31; round++) {
        const cellValue = player.gameResults?.[round];
        if (!cellValue || cellValue.trim() === "") {
          return { playerRank: rank, round };
        }
      }
    }
    
    return null; // No empty cells found
  };

  const handleEnterRecalculateSave = async (correctedString: string) => {
    if (!entryCell) return;

    log('[ENTER_GAMES]', 'Entered "' + correctedString + '" for cell P' + entryCell.playerRank + ' R' + (entryCell.round + 1));

    // Mark local changes if we're in server down mode
    if (isServerDownMode()) {
      markLocalChanges();
    }

    // Parse the game result to extract opponent ranks
    const parsedResult = updatePlayerGameData(
      correctedString.replace(/_$/, ""),
      true,
    );

    if (parsedResult.isValid) {
      const valueToSave = (parsedResult.resultString || correctedString).replace(/_$/, "").toUpperCase();
      const p1Rank = parsedResult.parsedPlayer1Rank || 0;
      const p2Rank = parsedResult.parsedPlayer2Rank || 0;
      const p3Rank = parsedResult.parsedPlayer3Rank || 0;
      const p4Rank = parsedResult.parsedPlayer4Rank || 0;
      
      const is4Player = p3Rank > 0 && p4Rank > 0;
      const currentPlayerRank = entryCell.playerRank;
      const roundIndex = entryCell.round;

      // Helper: fill a player's cell if empty (same round for all players in game)
      const fillCell = (playerRank: number, resultString: string) => {
        const player = players.find((p) => p.rank === playerRank);
        if (player && roundIndex >= 0 && roundIndex < 31) {
          const existingValue = player.gameResults[roundIndex]?.replace(/_+$/, "") || "";
          if (!existingValue.trim()) {
            player.gameResults[roundIndex] = resultString;
            log('[ENTER_GAMES]', 'Filled cell P' + playerRank + ' R' + (roundIndex + 1) + ': "' + resultString + '"');
          }
        }
      };

      if (is4Player) {
        // 4-player team game: format is "A:BWC:D" where C is outcome for team A&B
        const outcomeForTeam1 = valueToSave[3]; // Character at position 3 (0-indexed): "5:6W7:8"[3] = 'W'
        
        // Determine which team current player is on
        let isCurrentPlayerOnTeam1 = false;
        if (currentPlayerRank === p1Rank || currentPlayerRank === p2Rank) {
          isCurrentPlayerOnTeam1 = true;
        } else if (currentPlayerRank === p3Rank || currentPlayerRank === p4Rank) {
          isCurrentPlayerOnTeam1 = false;
        }
        
        // Did current player's team win?
        // In a team game, all teammates share the same W/L/D result
        const currentTeamWon = isCurrentPlayerOnTeam1 ? (outcomeForTeam1 === "W") : (outcomeForTeam1 === "L");
        
        // Outcome from each team's perspective
        const outcomeForTeam1TheirView = currentTeamWon ? "W" : "L";
        const outcomeForTeam2TheirView = currentTeamWon ? "L" : "W";

        // Build result strings for each team (all teammates get same result)
        const resultForTeam1 = `${p1Rank}:${p2Rank}${outcomeForTeam1TheirView}${p3Rank}:${p4Rank}`;
        const resultForTeam2 = `${p1Rank}:${p2Rank}${outcomeForTeam2TheirView}${p3Rank}:${p4Rank}`;

        // Fill cells for ALL players in the game (including current player)
        fillCell(p1Rank, resultForTeam1);
        fillCell(p2Rank, resultForTeam1);
        fillCell(p3Rank, resultForTeam2);
        fillCell(p4Rank, resultForTeam2);
      } else {
        // 2-player game: format is "AWB" where A vs B, outcome is A's result
        const outcome = valueToSave[1]; // Character at position 1: "5W3"[1] = 'W'
        
        // Determine if current player is player 1 or player 2 in the entry
        const isCurrentPlayerP1 = currentPlayerRank === p1Rank;
        const currentPlayerWon = isCurrentPlayerP1 ? (outcome === "W") : (outcome === "L");
        
        // Outcomes from each player's perspective
        const outcomeForP1 = currentPlayerWon ? "W" : "L";
        const outcomeForP2 = currentPlayerWon ? "L" : "W";

        // Build result strings
        const resultForP1 = `${p1Rank}${outcomeForP1}${p2Rank}`;
        const resultForP2 = `${p1Rank}${outcomeForP2}${p2Rank}`;

        // Fill cells for BOTH players (including current player)
        fillCell(p1Rank, resultForP1);
        fillCell(p2Rank, resultForP2);
      }
    }

    // Store current cell position to find next empty cell after recalc
    const currentCell = { ...entryCell };

    // Call recalculateAndSave immediately with the updated players array
    log('[ENTER_GAMES]', 'Calling recalculateAndSave()...');
    
    // REUSE the existing recalculateAndSave function from Operations menu
    await recalculateAndSave();
    
    // After successful save, find next empty cell
    const nextCell = findNextEmptyCell(currentCell.playerRank, currentCell.round);
    
    if (nextCell) {
      log('[ENTER_GAMES]', 'Moving to next empty cell: P' + nextCell.playerRank + ' R' + (nextCell.round + 1));
      // Keep enter-games mode active and open next cell
        setEntryCell(nextCell);
        setTempGameResult(null);
      } else {
        log('[ENTER_GAMES]', 'No more empty cells - exiting Enter Games mode');
      // No more empty cells - exit enter-games mode
      setIsEnterGamesMode(false);
      setEntryCell(null);
      setTempGameResult(null);
    }
    
    setEnterGamesError(null);
    console.log(">>> [ENTER_RECALCULATE_SAVE] Complete");
  };

  const handleEnterGamesClose = () => {
    console.log(">>> [ENTER_GAMES_CLOSE] Exiting Enter Games mode");
    setIsEnterGamesMode(false);
    setEntryCell(null);
    setTempGameResult(null);
    setEnterGamesError(null);
  };

  const recalculateRatings = async () => {
    console.log(`>>> [BUTTON PRESSED] Recalculate Ratings - ${players.length} players, isAdmin=${isAdmin}`);

    try {
      (window as any).__ladder_setStatus?.(`Recalculating ratings...`);

      // Clear save status - all cells need to be re-saved after recalculation
      clearAllSaveStatus();

      // Start batch mode - defer server sync until all operations complete
      startBatch();

      // Always build fresh matches from current UI state (no caching)
      console.log('[RECALC] Checking game errors...');
      const result = checkGameErrors();
      console.log(`[RECALC] Errors: ${result.hasErrors ? result.errors.length : 'none'}, Matches: ${result.matches.length}`);

      // If there are rank blocking errors, show alert and return early
      if (result.rankBlockingErrors && result.rankBlockingErrors.length > 0) {
        console.log(`=== RECALC PAUSED === Rank blocking errors detected`);
        alert('Rank Errors:\n\n' + result.rankBlockingErrors.join('\n') + '\n\nPlease fix ranks before recalculating.');
        return;
      }

      // Fix rank warnings (missing/duplicate ranks) before New Day + ReRank
      if (result.rankWarnings && result.rankWarnings.length > 0) {
        const pendingNewDayJson = localStorage.getItem(getKeyPrefix() + "ladder_pending_newday");
        if (pendingNewDayJson) {
          try {
            const pendingNewDay = JSON.parse(pendingNewDayJson);
            if (pendingNewDay.reRank === true) {
              console.log('[RECALC] Fixing rank warnings before New Day + ReRank');
              const fixedPlayers = fixPlayerRanks(players);
              console.log(`[RECALC] Fixed ${players.length} players to ${fixedPlayers.length} (removed duplicates)`);
              setPlayers(fixedPlayers);
              players.length = 0;
              players.push(...fixedPlayers);
            }
          } catch {
            // ignore
          }
        }
      }

      // If there are errors, show the error dialog and return early
      if (result.hasErrors && result.errors.length > 0) {
        console.log(`=== RECALC PAUSED === Found ${result.errors.length} errors - showing error dialog`);
        return;
      }

      let matches: MatchData[] = result.matches;
      let playerResultsByMatch: Map<string, PlayerMatchResult[]> | undefined =
        result.playerResultsByMatch;

      console.log(`\n=== RECALC START === Matches to process: ${matches.length}`);
      // Count existing game results before clear
      let totalExisting = 0;
      for (const p of players) {
        const filled = p.gameResults.filter((r) => r !== null && r !== "");
        totalExisting += filled.length;
      }
      console.log(`Total existing game results: ${totalExisting}`);

      console.log('[RECALC] Repopulating game results...');
      const processedPlayers = repopulateGameResults(
        players,
        matches,
        31,
        playerResultsByMatch,
      );

      let totalAfterRepop = 0;
      for (const p of processedPlayers) {
        const filled = p.gameResults.filter((r) => r !== null && r !== "");
        totalAfterRepop += filled.length;
      }
      console.log(`Total results after repopulation: ${totalAfterRepop}`);

      console.log('[RECALC] Calculating ratings...');
      const calculatedPlayers = calculateRatings(processedPlayers, matches).players;
      console.log('[RECALC] Ratings calculated.');

      // Check for pending New Day operation (set by App.tsx before calling recalculate)
      const pendingNewDayJson = localStorage.getItem(
        getKeyPrefix() + "ladder_pending_newday",
      );
      if (pendingNewDayJson) {
        console.log(
          `>>> [RECALC COMPLETE] Pending New Day detected: ${pendingNewDayJson}`,
        );
        try {
          const pendingNewDay = JSON.parse(pendingNewDayJson);
          const reRank = pendingNewDay.reRank === true;
          console.log(`>>> [NEW DAY] Processing with reRank=${reRank}`);

          // Get current title and determine next title for mini-games
          const currentTitle = getProjectName();
          const normalizedTitle = String(currentTitle || "")
            .toLowerCase()
            .trim();
          console.log(
            `>>> [NEW DAY] Current title from storage: "${currentTitle}" (normalized: "${normalizedTitle}")`,
          );
          const nextTitle = (() => {
            const index = MINI_GAMES.findIndex(
              (game) => game.toLowerCase() === normalizedTitle,
            );
            console.log(
              `>>> [NEW DAY] findIndex result: ${index} for "${currentTitle}" (normalized: "${normalizedTitle}")`,
            );
            if (index !== -1) {
              return MINI_GAMES[(index + 1) % MINI_GAMES.length];
            }
            return currentTitle;
          })();
          console.log(`>>> [NEW DAY] Next title will be: "${nextTitle}"`);

       // Apply New Day transformations
        const finalPlayers = processNewDayTransformations(
          calculatedPlayers,
          reRank,
        );

           await savePlayers(finalPlayers);
          setProjectNameStorage(nextTitle);
          localStorage.removeItem(getKeyPrefix() + "ladder_pending_newday");
          localStorage.removeItem(getKeyPrefix() + "ladder_settings");

          if (shouldLog(10)) {
            console.log(
              `New Day complete - Title: ${nextTitle}, ReRank: ${reRank}\n`,
            );
          }

          setPlayers(finalPlayers);

          // Flush batch buffer to server before reload
          await endBatch();

          // Reload to apply changes
          window.location.reload();
          return;
        } catch (err) {
          console.error("Failed to process pending New Day:", err);
          localStorage.removeItem(getKeyPrefix() + "ladder_pending_newday");
        }
      }

      console.log('[RECALC] Setting players and saving...');
      const normalizedPlayers = normalizePlayersTrophy(calculatedPlayers);
      setPlayers(normalizedPlayers);
      await savePlayers(normalizedPlayers);
      if (shouldLog(10)) {
        console.log("Rating calculation complete\n");
      }

      // End batch mode - triggers single server sync with all accumulated changes
      console.log('[RECALC] Ending batch mode...');
      await endBatch();
      
      console.log('[RECALC] Recalculate complete.');
      (window as any).__ladder_setStatus?.(null);
    } catch (err) {
      console.error('[RECALC] ERROR:', err);
      console.error('[RECALC] Stack:', err instanceof Error ? err.stack : 'N/A');
      (window as any).__ladder_setStatus?.('Recalculate failed - see console');
      setTimeout(() => (window as any).__ladder_setStatus?.(null), 5000);
    }
  };

  useEffect(() => {
    if (onSetRecalculateRef) {
      onSetRecalculateRef(recalculateRatings);
    }
  }, [onSetRecalculateRef, recalculateRatings]);

 /**
    * Recalculate ratings AND save to server/localStorage in one operation
    * This is the primary save operation for users
    */
   const recalculateAndSave = async () => {
     log('[RECALC]', 'Starting recalculate_and_save');

     // Check for pending New Day operation (set by App.tsx before calling recalculate)
     const pendingNewDayJson = localStorage.getItem(
       getKeyPrefix() + "ladder_pending_newday",
     );
     if (pendingNewDayJson) {
       console.log(
         `>>> [RECALC COMPLETE] Pending New Day detected: ${pendingNewDayJson}`,
       );
       try {
         const pendingNewDay = JSON.parse(pendingNewDayJson);
         const reRank = pendingNewDay.reRank === true;
         console.log(`>>> [NEW DAY] Processing with reRank=${reRank}`);

         // Get current title and determine next title for mini-games
         const currentTitle = getProjectName();
         const normalizedTitle = String(currentTitle || "")
           .toLowerCase()
           .trim();
         console.log(
           `>>> [NEW DAY] Current title from storage: "${currentTitle}" (normalized: "${normalizedTitle}")`,
         );
         const nextTitle = (() => {
           const index = MINI_GAMES.findIndex(
             (game) => game.toLowerCase() === normalizedTitle,
           );
           console.log(
             `>>> [NEW DAY] findIndex result: ${index} for "${currentTitle}" (normalized: "${normalizedTitle}")`,
           );
           if (index !== -1) {
             return MINI_GAMES[(index + 1) % MINI_GAMES.length];
           }
           return currentTitle;
         })();
         console.log(`>>> [NEW DAY] Next title will be: "${nextTitle}"`);

        // Fix rank issues before New Day transformations
           let playersToTransform = normalizePlayersTrophy(players);
           if (reRank) {
             playersToTransform = fixPlayerRanks(playersToTransform);
           }
           // Apply New Day transformations
            const finalPlayers = processNewDayTransformations(
              playersToTransform,
              reRank,
            );

          await savePlayers(finalPlayers);
         setProjectNameStorage(nextTitle);
         localStorage.removeItem(getKeyPrefix() + "ladder_pending_newday");
         localStorage.removeItem(getKeyPrefix() + "ladder_settings");

         if (shouldLog(10)) {
           console.log(
             `New Day complete - Title: ${nextTitle}, ReRank: ${reRank}\n`,
           );
         }

         setPlayers(finalPlayers);

          // Flush batch buffer to server before reload
          await endBatch();

          // Reload to apply changes
          window.location.reload();
          return;
        } catch (err) {
          console.error("Failed to process pending New Day (recalculateAndSave):", err);
          localStorage.removeItem(getKeyPrefix() + "ladder_pending_newday");
        }
      }

     // Admin mode: fetch fresh server data, merge with local, then push back atomically
      if (isAdmin) {
        log('[RECALC]', 'Admin mode - fetching server data and calculating');
        
        // Clear save status - all cells need to be re-saved after recalculation
        clearAllSaveStatus();

        // Fetch fresh data from server before calculating to avoid losing user-reported games
        const serverUrl = loadUserSettings().server?.trim();
        let mergePlayers: PlayerData[] = players;

        if (serverUrl) {
          try {
            const response = await fetch(`${serverUrl}/api/ladder`);
            if (response.ok) {
              const data = await response.json();
              const serverPlayers = data.data?.players || [];
              
              // Merge: take gameResults + player data from server, keep local nRatings and admin edits
              mergePlayers = serverPlayers.map((sp: PlayerData) => {
                const localPlayer = players.find(lp => lp.rank === sp.rank);
                return {
                  ...sp,
                  nRating: localPlayer?.nRating !== undefined ? localPlayer.nRating : sp.nRating,
                  gameResults: sp.gameResults || new Array(31).fill(null),
                };
              });
              
              log('[RECALC]', `Merged ${mergePlayers.length} players from server for recalc`);
            } else {
              log('[RECALC]', 'Server fetch failed during merge, using local players');
            }
          } catch (error) {
            log('[RECALC]', 'Error fetching server data during merge:', error);
          }
        }

        // Build fresh matches from merged UI state (no caching)
        const result = checkGameErrorsWithPlayers(mergePlayers);

        // If there are rank blocking errors, show alert and return early
        if (result.rankBlockingErrors && result.rankBlockingErrors.length > 0) {
          console.log(`=== RECALC PAUSED === Rank blocking errors detected`);
          alert('Rank Errors:\n\n' + result.rankBlockingErrors.join('\n') + '\n\nPlease fix ranks before recalculating.');
          return;
        }

        // If there are errors, show the error dialog and return early
        if (result.hasErrors && result.errors.length > 0) {
          if (shouldLog(5)) {
            console.log(`\n=== RECALC PAUSED ===`);
            console.log(
              `Found ${result.errors.length} errors - showing error dialog`,
            );
          }
          return;
        }

        let matches: MatchData[] = result.matches;
        let playerResultsByMatch: Map<string, PlayerMatchResult[]> | undefined =
          result.playerResultsByMatch;

        if (shouldLog(5)) {
          console.log(`\n=== RECALC START ===`);
          console.log(`Matches to process: ${matches.length}`);
          let totalExisting = 0;
          for (const p of mergePlayers) {
            const filled = p.gameResults.filter((r) => r !== null && r !== "");
            totalExisting += filled.length;
          }
          console.log(`Total existing game results: ${totalExisting}`);
        }

        const processedPlayers = repopulateGameResults(
          mergePlayers,
          matches,
          31,
          playerResultsByMatch,
        );

        if (shouldLog(5)) {
          let totalAfterRepop = 0;
          for (const p of processedPlayers) {
            const filled = p.gameResults.filter((r) => r !== null && r !== "");
            totalAfterRepop += filled.length;
          }
          console.log(`Total results after repopulation: ${totalAfterRepop}`);
        }

        const calculatedPlayers = calculateRatings(processedPlayers, matches).players;
        const normalizedPlayers = normalizePlayersTrophy(calculatedPlayers);

        // Save with waitForServer=true to wait for server confirmation
        (window as any).__ladder_setStatus?.('Saving to server...');
        log('[RECALC]', 'Saving to server...');
        const saveResult = await savePlayers(normalizedPlayers, true);
        
        if (saveResult.success) {
          if (saveResult.serverSynced) {
            log('[RECALC]', '✓ Saved to server');
            clearLocalChangesFlag();
            clearPendingDeletes();
          } else {
            log('[RECALC]', '✓ Saved locally (server sync skipped)');
          }
        }
        if (saveResult.error) {
          log('[RECALC]', '⚠ Server save issue:', saveResult.error);
        }
        
        setPlayers(normalizedPlayers);
        log('[RECALC]', 'Recalculate_Save complete');
        (window as any).__ladder_setStatus?.(null);
        return;
      }

     // User mode: calculate locally, push full table to server, pull back fresh data
      log('[RECALC]', 'User mode - calculating locally and syncing with server');
      
      clearAllSaveStatus();

      const result = checkGameErrorsWithPlayers(players);

      if (result.rankBlockingErrors && result.rankBlockingErrors.length > 0) {
        if (shouldLog(5)) {
          console.log(`\n=== RECALC PAUSED === Rank blocking errors detected`);
        }
        alert('Rank Errors:\n\n' + result.rankBlockingErrors.join('\n') + '\n\nPlease fix ranks before recalculating.');
        return;
      }

      if (result.hasErrors && result.errors.length > 0) {
        if (shouldLog(5)) {
          console.log(`\n=== RECALC PAUSED ===`);
          console.log(`Found ${result.errors.length} errors - showing error dialog`);
        }
        return;
      }

      let matches: MatchData[] = result.matches;
      let playerResultsByMatch: Map<string, PlayerMatchResult[]> | undefined = result.playerResultsByMatch;

      if (shouldLog(5)) {
        console.log(`\n=== RECALC START ===`);
        console.log(`Matches to process: ${matches.length}`);
      }

    const processedPlayers = repopulateGameResults(players, matches, 31, playerResultsByMatch);
       const calculatedPlayers = calculateRatings(processedPlayers, matches).players;
       const normalizedPlayers = normalizePlayersTrophy(calculatedPlayers);

       // Push full table to server
       (window as any).__ladder_setStatus?.('Saving to server...');
       log('[RECALC]', 'Pushing full table to server...');
       await savePlayers(normalizedPlayers, true);
       clearLocalChangesFlag();
       clearPendingDeletes();

       // Pull fresh data back from server to ensure UI matches server exactly
       log('[RECALC]', 'Pulling fresh data from server...');
       try {
         const userSettings = loadUserSettings();
         const serverUrl = userSettings.server?.trim();
         
         if (serverUrl) {
           const response = await fetch(`${serverUrl}/api/ladder`);
           if (response.ok) {
             const data = await response.json();
             const serverPlayers = data.data?.players || [];
             if (serverPlayers && serverPlayers.length > 0) {
               setPlayers(normalizePlayersTrophy(serverPlayers));
               log('[RECALC]', '✓ Synced with server - UI refreshed from server data');
             } else {
               setPlayers(normalizedPlayers);
             }
           } else {
             setPlayers(normalizedPlayers);
           }
         } else {
           setPlayers(normalizedPlayers);
         }
       } catch {
         setPlayers(normalizedPlayers);
       }

      log('[RECALC]', 'Recalculate_Save complete');
      (window as any).__ladder_setStatus?.(null);
    };

  /**
   * Refresh players from server/storage
   * Called when polling detects data changes from other clients
   */
  const refreshPlayers = async () => {
    // In admin mode, skip server refresh when local data is pending confirmation
    // (e.g., file import or backup restore preview) — local data should win
    if (pendingImport || pendingRestore) {
      log('[REFRESH]', 'Skipped — pending confirmation dialog');
      return;
    }
    
    try {
      log('[REFRESH]', 'Refreshing players from server');
      
      // Force fresh fetch from server (bypass cache)
      const userSettings = loadUserSettings();
      const serverUrl = userSettings.server?.trim();
      
      if (!serverUrl) {
        log('[REFRESH]', 'No server configured, using local data');
        const localPlayers = await getPlayers();
        if (localPlayers && localPlayers.length > 0) {
          setPlayers(localPlayers.map((player: PlayerData) => ({
            ...player,
            gameResults: player.gameResults || new Array(31).fill(null),
          })));
        }
        return;
      }
      
      const response = await fetch(`${serverUrl}/api/ladder`);
      if (!response.ok) {
        log('[REFRESH]', 'Server fetch failed, using local data');
        const localPlayers = await getPlayers();
        if (localPlayers && localPlayers.length > 0) {
          setPlayers(localPlayers.map((player: PlayerData) => ({
            ...player,
            gameResults: player.gameResults || new Array(31).fill(null),
          })));
        }
        return;
      }
      
      const data = await response.json();
      const freshPlayers = data.data?.players || [];
      
      if (freshPlayers && freshPlayers.length > 0) {
        // Preserve local nRating values - server returns 0 for all (ladder.tab doesn't store them)
        const playersWithResults = freshPlayers.map((player: PlayerData) => {
          // Find corresponding local player to preserve nRating
          const localPlayer = players.find((lp: PlayerData) => lp.rank === player.rank);
          return {
            ...player,
            nRating: localPlayer?.nRating !== undefined ? localPlayer.nRating : player.nRating,
            gameResults: player.gameResults || new Array(31).fill(null),
          };
        });
        
        // Update state (preserve sort order)
        setPlayers(playersWithResults);
        
        log('[REFRESH]', '✓ Refreshed ' + playersWithResults.length + ' players from server');
      }
    } catch (error) {
      log('[REFRESH]', '✗ Failed to refresh:', error);
    }
  };

  // Expose refreshPlayers function to App.tsx
  useEffect(() => {
    if (onSetRefreshPlayersRef) {
      onSetRefreshPlayersRef(refreshPlayers);
    }
  }, [onSetRefreshPlayersRef, refreshPlayers]);

  const countNonBlankRounds = (): number => {
    let count = 0;
    for (const player of players) {
      const gameResults = player.gameResults || [];
      for (const result of gameResults) {
        if (result && result.trim() !== "") {
          count++;
        }
      }
    }
    return count;
  };

  /**
   * Get display value for a game result cell
   * Adds "_" suffix if result is valid AND saved
   */
  const getCellDisplayValue = (playerRank: number, round: number, result: string | null): string => {
    if (!result || result.trim() === '') {
      return '';
    }
    
    // Check if result already has underscore (from server load)
    const hasExistingUnderscore = result.endsWith('_');
    
    // Remove existing underscore for processing
    const cleanResult = result.replace(/_+$/, '');
    
    if (cleanResult.trim() === '') {
      return '';
    }
    
    // Check if cell is saved via tracking OR already has underscore in data
    const isSaved = isCellSaved(playerRank, round) || hasExistingUnderscore;
    
    // Add underscore suffix if saved
    return isSaved ? cleanResult + '_' : cleanResult;
  };

  const findFirstEmptyCell = (): { playerRank: number; round: number } | null => {
    for (const player of players) {
      for (let r = 0; r < 31; r++) {
        const result = player.gameResults?.[r] || '';
        if (!result || result.trim() === '') {
          return { playerRank: player.rank, round: r };
        }
      }
    }
    return null;
  };

  const handleCorrectionSubmit = (correctedString: string) => {
    // Mark local changes if we're in server down mode
    if (isServerDownMode()) {
      markLocalChanges();
    }

    // In walkthrough mode, handle clearing cells without pendingPlayers
    if (isWalkthrough && entryCell) {
      if (!correctedString.trim()) {
        // Clear the cell in players data
        const updatedPlayers = players.map((p) => {
          if (p.rank === entryCell.playerRank) {
            const newGameResults = [...(p.gameResults || [])];
            newGameResults[entryCell.round] = "";
            return { ...p, gameResults: newGameResults };
          }
          return { ...p };
        });
        setPlayers(updatedPlayers);

        // Advance to next cell or close dialog
        if (walkthroughIndex < getNonBlankCells().length - 1) {
          const newIndex = walkthroughIndex + 1;
          setWalkthroughIndex(newIndex);
          const cell = getNonBlankCells()[newIndex];
          if (cell) {
            setEntryCell({ playerRank: cell.playerRank, round: cell.round });
          }
        } else {
          setIsWalkthrough(false);
        }
      }
      return;
    }

    if (!pendingPlayers || !pendingMatches) return;
    // In recalculate mode, use entryCell or walkthroughErrors since currentError is null
    if (!currentError && !entryCell) return;

    // Handle empty string from "Clear Cell" - treat as valid (no result)
    if (!correctedString.trim()) {
      const updatedPlayers = players.map((p) => ({ ...p }));
      const pendingUpdatedPlayers = pendingPlayers.map((p) => ({ ...p }));

      // Update the cell where the error was detected (entryCell)
      if (entryCell) {
        const player = updatedPlayers.find(
          (p) => p.rank === entryCell.playerRank,
        );
        const pendingPlayer = pendingUpdatedPlayers.find(
          (p) => p.rank === entryCell.playerRank,
        );
        if (player && pendingPlayer) {
          const newGameResults = [...player.gameResults];
          const newPendingGameResults = [...pendingPlayer.gameResults];
          newGameResults[entryCell.round] = "";
          newPendingGameResults[entryCell.round] = "";
          player.gameResults = newGameResults;
          pendingPlayer.gameResults = newPendingGameResults;
        }
      }

      setPlayers(updatedPlayers);
      setPendingPlayers(pendingUpdatedPlayers);
      latestPendingPlayersRef.current = pendingUpdatedPlayers;

      // Remove this error from the walkthrough errors list
      const newWalkthroughErrors = walkthroughErrors.filter(
        (error) =>
          !(
            error.playerRank === entryCell?.playerRank &&
            error.resultIndex === entryCell?.round
          ),
      );
      setWalkthroughErrors(newWalkthroughErrors);

      if (newWalkthroughErrors.length > 0) {
        // Find position of current error in original list, then use same index in filtered list
        let currentIndex = -1;
        for (let i = 0; i < walkthroughErrors.length; i++) {
          if (
            walkthroughErrors[i].playerRank === entryCell?.playerRank &&
            walkthroughErrors[i].resultIndex === entryCell?.round
          ) {
            currentIndex = i;
            break;
          }
        }

        // Use currentIndex (or 0 if we're at the end) as the new index in filtered list
        const newIndex =
          currentIndex < newWalkthroughErrors.length
            ? currentIndex
            : newWalkthroughErrors.length - 1;

        const nextError = newWalkthroughErrors[newIndex];
        if (nextError) {
          setWalkthroughIndex(newIndex);
          setCurrentError(nextError);
          setEntryCell({
            playerRank: nextError.playerRank,
            round: nextError.resultIndex,
          });
        } else {
          completeRatingCalculation(pendingUpdatedPlayers);
        }
      } else {
        completeRatingCalculation(pendingUpdatedPlayers);
      }
      return;
    }

    const validation = updatePlayerGameData(correctedString, true);

    if (!validation.isValid) {
      const errorCode = Math.abs(validation.error || 10);
      console.log('[submitCorrection] Invalid format:', {
        input: correctedString,
        errorCode,
        parsedPlayers: validation.parsedPlayersList,
        parsedScores: validation.parsedScoreList,
      });
      alert(`Invalid format. Error code: ${errorCode}`);
      return;
    }

    const updatedPlayers = players.map((p) => ({ ...p }));
    const pendingUpdatedPlayers = pendingPlayers.map((p) => ({ ...p }));

    // Update the cell where the error was detected (entryCell)
    if (entryCell) {
      const player = updatedPlayers.find(
        (p) => p.rank === entryCell.playerRank,
      );
      const pendingPlayer = pendingUpdatedPlayers.find(
        (p) => p.rank === entryCell.playerRank,
      );
      if (player && pendingPlayer) {
        const newGameResults = [...player.gameResults];
        const newPendingGameResults = [...pendingPlayer.gameResults];
        newGameResults[entryCell.round] = correctedString + "_";
        newPendingGameResults[entryCell.round] = correctedString + "_";
        player.gameResults = newGameResults;
        pendingPlayer.gameResults = newPendingGameResults;
      }
    }

    // Remove this error from the walkthrough errors list (match both playerRank and resultIndex)
    const currentPlayerRank = entryCell?.playerRank ?? -1;
    const currentResultIndex = entryCell?.round ?? -1;
    const newWalkthroughErrors = walkthroughErrors.filter(
      (error) =>
        !(
          error.playerRank === currentPlayerRank &&
          error.resultIndex === currentResultIndex
        ),
    );

    setPlayers(updatedPlayers);
    setPendingPlayers(pendingUpdatedPlayers);
    latestPendingPlayersRef.current = pendingUpdatedPlayers;
    setCurrentError(null);
    setWalkthroughErrors(newWalkthroughErrors);
    // setEntryCell(null); // Removed to maintain highlighting during recalculation
    // After correction: move to next error or complete if recalculation mode
    if (isRecalculating) {
      if (newWalkthroughErrors.length > 0) {
        // Find the correct index after filtering - adjust for removed error
        const currentIndex = walkthroughIndex;
        const adjustedIndex = Math.min(
          currentIndex,
          newWalkthroughErrors.length - 1,
        );
        const nextError = newWalkthroughErrors[adjustedIndex];
        if (nextError) {
          setWalkthroughIndex(adjustedIndex);
          setCurrentError(nextError);
          setEntryCell({
            playerRank: nextError.playerRank,
            round: nextError.resultIndex,
          });
        } else {
          completeRatingCalculation(pendingUpdatedPlayers);
        }
      } else {
        completeRatingCalculation(pendingUpdatedPlayers);
      }
    } else if (newWalkthroughErrors.length === 0) {
      completeRatingCalculation(pendingUpdatedPlayers);
    }
  };

  const handleCorrectionCancel = () => {
    if (shouldLog(10)) {
      console.log(">>> [BUTTON PRESSED] Cancel");
    }

    // Clear pending New Day flag since user is cancelling
    localStorage.removeItem(getKeyPrefix() + "ladder_pending_newday");

    // If we have pendingPlayers with corrections, complete the calculation first
    // Use the ref to get the latest updated players (not the stale state)
    if (latestPendingPlayersRef.current && pendingMatches) {
      completeRatingCalculation(latestPendingPlayersRef.current);
    } else if (pendingPlayers && pendingMatches) {
      completeRatingCalculation(pendingPlayers);
    }
    setCurrentError(null);
    setIsRecalculating(false);
    setPendingPlayers(null);
    setPendingMatches(null);
    setWalkthroughErrors([]);
    setWalkthroughIndex(0);
    setEntryCell(null);
    setTempGameResult(null);
  };

  const completeRatingCalculation = async (usePendingPlayers?: PlayerData[]) => {
    const playersToUse = usePendingPlayers || pendingPlayers;
    if (!playersToUse || !pendingMatches) return;

    const processedPlayers = repopulateGameResults(
      playersToUse,
      pendingMatches,
      31,
      pendingPlayerResultsByMatch || undefined,
    );
    let calculatedPlayers = calculateRatings(processedPlayers, pendingMatches).players;

    // Check for pending New Day operation
    const pendingNewDayJson = localStorage.getItem(getKeyPrefix() + "ladder_pending_newday");
    if (pendingNewDayJson) {
      console.log(
        `>>> [COMPLETE CALC] Pending New Day detected: ${pendingNewDayJson}`,
      );
      try {
        const pendingNewDay = JSON.parse(pendingNewDayJson);
        const reRank = pendingNewDay.reRank === true;
        console.log(`>>> [NEW DAY] Processing with reRank=${reRank}`);

        // Get current title and determine next title for mini-games
        const currentTitle = getProjectName();
        const normalizedTitle = String(currentTitle || "")
          .toLowerCase()
          .trim();
        const nextTitle = (() => {
          const index = MINI_GAMES.findIndex(
            (game) => game.toLowerCase() === normalizedTitle,
          );
          if (index !== -1) {
            return MINI_GAMES[(index + 1) % MINI_GAMES.length];
          }
          return currentTitle;
        })();

        // Fix rank issues before New Day transformations
        let playersToTransform = normalizePlayersTrophy(calculatedPlayers);
          if (reRank) {
              playersToTransform = fixPlayerRanks(players);
            }
        // Apply New Day transformations
        const finalPlayers = processNewDayTransformations(
          playersToTransform,
          reRank,
        );

        calculatedPlayers = finalPlayers;

        await savePlayers(finalPlayers);
        setProjectNameStorage(nextTitle);
        localStorage.removeItem(getKeyPrefix() + "ladder_pending_newday");
        localStorage.removeItem(getKeyPrefix() + "ladder_settings");

        if (shouldLog(10)) {
          console.log(
            `New Day complete - Title: ${nextTitle}, ReRank: ${reRank}`,
          );
        }

        setPlayers(finalPlayers);
        setPendingPlayers(null);
        setPendingMatches(null);
        setWalkthroughErrors([]);
        setWalkthroughIndex(0);
        setCurrentError(null);
        setEntryCell(null);
        setIsRecalculating(false);

        // Reload to apply changes
        window.location.reload();
        return;
      } catch (err) {
        console.error("Failed to process pending New Day:", err);
        localStorage.removeItem(getKeyPrefix() + "ladder_pending_newday");
      }
    }

    setPlayers(calculatedPlayers);
    await savePlayers(calculatedPlayers);

    setPendingPlayers(null);
    setPendingMatches(null);
    setWalkthroughErrors([]);
    setWalkthroughIndex(0);
    setCurrentError(null);
    setEntryCell(null);
    setIsRecalculating(false);
    if (shouldLog(10)) {
      console.log("Rating calculation complete");
    }
  };

  const handleWalkthroughNext = () => {
    if (walkthroughIndex < walkthroughErrors.length - 1) {
      setWalkthroughIndex(walkthroughIndex + 1);
      setEntryCell({
        playerRank: walkthroughErrors[walkthroughIndex + 1]?.playerRank,
        round: walkthroughErrors[walkthroughIndex + 1]?.resultIndex,
      });
    } else {
      completeRatingCalculation();
    }
  };

  const handleWalkthroughPrev = () => {
    if (walkthroughIndex > 0) {
      setWalkthroughIndex(walkthroughIndex - 1);
    }
  };

  const getNonBlankCells = (): { playerRank: number; round: number }[] => {
    const cells: { playerRank: number; round: number }[] = [];
    for (let playerIdx = 0; playerIdx < players.length; playerIdx++) {
      const gameResults = players[playerIdx]?.gameResults ?? [];
      if (gameResults.length === 0) continue;
      for (let roundIdx = 0; roundIdx < gameResults.length; roundIdx++) {
        const result = gameResults[roundIdx];
        if (result != null && result.trim() !== "") {
          cells.push({ playerRank: playerIdx + 1, round: roundIdx });
        }
      }
    }
    return cells;
  };

  const handleWalkthroughNextForReview = () => {
    if (isWalkthrough && walkthroughIndex < getNonBlankCells().length - 1) {
      const newIndex = walkthroughIndex + 1;
      setWalkthroughIndex(newIndex);
      // Update entryCell to highlight the new cell
      const cell = getNonBlankCells()[newIndex];
      if (cell) {
        setEntryCell({ playerRank: cell.playerRank, round: cell.round });
      }
    } else {
      setIsWalkthrough(false);
    }
  };

  const handleWalkthroughPrevForReview = () => {
    if (isWalkthrough && walkthroughIndex > 0) {
      const newIndex = walkthroughIndex - 1;
      setWalkthroughIndex(newIndex);
      // Update entryCell to highlight the new cell
      const cell = getNonBlankCells()[newIndex];
      if (cell) {
        setEntryCell({ playerRank: cell.playerRank, round: cell.round });
      }
    }
  };

  const clearCurrentCell = () => {
    if (!entryCell) return;

    // Mark local changes if we're in server down mode
    if (isServerDownMode()) {
      markLocalChanges();
    }

    // Get the value of the cell being cleared (strip trailing underscore for comparison)
    const playerToClear = players.find((p) => p.rank === entryCell.playerRank);
    const rawCellValue = playerToClear?.gameResults?.[entryCell.round] || "";
    const cellValue = rawCellValue.replace(/_+$/, ""); // Strip trailing underscores

    console.log(`>>> [CLEAR CELL DEBUG] Cell: ${entryCell.playerRank}:${entryCell.round}, Raw: "${rawCellValue}", Value: "${cellValue}"`);

    // Find all cells with the same value across all players (ignoring trailing underscores)
    const cellsToClear: { playerRank: number; round: number }[] = [];
    
    for (const player of players) {
      if (!player.gameResults) continue;
      
      for (let r = 0; r < player.gameResults.length; r++) {
        const cellValueNormalized = player.gameResults[r]?.replace(/_+$/, "") || "";
        if (cellValueNormalized === cellValue && cellValue !== "") {
          cellsToClear.push({ playerRank: player.rank, round: r });
        }
      }
    }

    console.log(`>>> [CLEAR CELL DEBUG] Found ${cellsToClear.length} matching cells to clear`);

    // If no matches found but cell has content, debug and force-clear at least the current cell
    if (cellsToClear.length === 0 && cellValue !== "") {
      console.log(`>>> [CLEAR CELL DEBUG] No matches found for "${cellValue}", forcing clear of current cell only`);
      cellsToClear.push({ playerRank: entryCell.playerRank, round: entryCell.round });
    }

    // Clear all matching cells
    const updatedPlayers = players.map((p) => {
      const newGameResults = [...(p.gameResults || [])];
      let modified = false;
      
      for (const cell of cellsToClear) {
        if (cell.playerRank === p.rank) {
          const currentValue = newGameResults[cell.round] || "";
          const currentValueNormalized = currentValue.replace(/_+$/, "");
          if (currentValueNormalized === cellValue) {
            newGameResults[cell.round] = "";
            modified = true;
          }
        }
      }
      
      return modified ? { ...p, gameResults: newGameResults } : p;
    });
    
    setPlayers(updatedPlayers);
    const saveTarget = isAdmin ? true : false;
    savePlayers(updatedPlayers, saveTarget).then((result) => {
      if (result.success && result.serverSynced) {
        console.log(`[CLEAR CELL] ✓ Cleared ${cellsToClear.length} matching cells with value "${cellValue}" — saved to server`);
      } else if (result.success) {
        console.log(`[CLEAR CELL] ✓ Cleared ${cellsToClear.length} matching cells with value "${cellValue}" — saved locally`);
      }
    }).catch((err) => {
      console.error("Failed to save cleared cell:", err);
    });

    // Log how many cells were cleared
    if (cellsToClear.length > 1) {
      console.log(`>>> [CLEAR CELL] Cleared ${cellsToClear.length} matching cells with value "${cellValue}"`);
    }

    // Remove all errors for cleared cells from walkthrough
    if (walkthroughErrors.length > 0) {
      const newWalkthroughErrors = walkthroughErrors.filter(
        (error) => !cellsToClear.some((cell) => 
          error.playerRank === cell.playerRank && error.resultIndex === cell.round
        ),
      );
      setWalkthroughErrors(newWalkthroughErrors);

      if (newWalkthroughErrors.length > 0) {
        const nextError =
          newWalkthroughErrors[walkthroughIndex] || newWalkthroughErrors[0];
        setCurrentError(nextError);
        setEntryCell({
          playerRank: nextError.playerRank,
          round: nextError.resultIndex,
        });
      } else {
        setCurrentError(null);
        setIsRecalculating(false);
      }
    }
  };

  const handleGameEntrySubmit = (correctedString: string) => {
    if (!entryCell) return;

    const parsedResult = updatePlayerGameData(
      correctedString.replace(/_$/, ""),
      true,
    );

    if (parsedResult.isValid) {
      // Mark local changes if we're in server down mode
      if (isServerDownMode()) {
        markLocalChanges();
      }

      setPlayers((prevPlayers) => {
        const player = prevPlayers.find((p) => p.rank === entryCell.playerRank);
        if (!player) return prevPlayers;

        // Remove underscore when saving from edit dialog
        const valueToSave = (
          parsedResult.resultString || correctedString
        ).replace(/_$/, "");

        const newGameResults = [...player.gameResults];
        newGameResults[entryCell.round] = valueToSave;

        const updatedPlayers = prevPlayers.map((p) =>
          p.rank === entryCell.playerRank
            ? { ...p, gameResults: newGameResults }
            : p,
        );

        savePlayers(updatedPlayers).catch((err) => {
          console.error("Failed to save game entry:", err);
        });
        return updatedPlayers;
      });
    }

    // Check for pending paste results and continue filling cells
    const pasteResults = (window as any)?.__pasteResults;
    if (
      pasteResults &&
      Array.isArray(pasteResults) &&
      pasteResults.length > 1
    ) {
      if (shouldLog(10)) {
        console.log(
          `>>> [PASTE CONTINUE] ${pasteResults.length - 1} results remaining`,
        );
      }

      // Remove first result (just used)
      const remaining = pasteResults.slice(1);
      (window as any).__pasteResults = remaining;

      // Find next empty cell starting from current position
      let foundCell: { playerRank: number; round: number } | null = null;
      const startRank = entryCell.playerRank;
      const startRound = entryCell.round + 1;

      for (let rank = startRank; rank <= players.length; rank++) {
        const player = players.find((p) => p.rank === rank);
        if (!player) continue;

        // If this is the starting rank, start from next round
        const startR = rank === startRank ? startRound : 0;

        for (let round = startR; round < 31; round++) {
          const cellValue = player.gameResults[round];
          if (!cellValue || cellValue.trim() === "") {
            foundCell = { playerRank: rank, round };
            if (shouldLog(10)) {
              console.log(
                `>>> [PASTE CONTINUE] Found empty cell at Rank ${rank}, Round ${round + 1}`,
              );
            }
            break;
          }
        }
        if (foundCell) break;
      }

      // If no more cells found from current position, search from beginning
      if (!foundCell) {
        for (let rank = 1; rank <= players.length; rank++) {
          const player = players.find((p) => p.rank === rank);
          if (!player) continue;

          for (let round = 0; round < 31; round++) {
            const cellValue = player.gameResults[round];
            if (!cellValue || cellValue.trim() === "") {
              foundCell = { playerRank: rank, round };
              if (shouldLog(10)) {
                console.log(
                  `>>> [PASTE CONTINUE] Found empty cell at Rank ${rank}, Round ${round + 1}`,
                );
              }
              break;
            }
          }
          if (foundCell) break;
        }
      }

      // Open dialog for next cell with next result
      if (foundCell && remaining.length > 0) {
        // Don't clear entryCell yet - will open next cell after brief delay
        setTimeout(() => {
          setEntryCell(null);
          setTempGameResult(null);
          setEntryCell(foundCell);
          setTempGameResult({
            playerRank: foundCell.playerRank,
            round: foundCell.round,
            resultString: remaining[0],
            parsedPlayer1Rank: 0,
            parsedPlayer2Rank: 0,
          });
          if (shouldLog(10)) {
            console.log(
              `>>> [PASTE CONTINUE] Opening cell with result: "${remaining[0]}"`,
            );
          }
        }, 100);
        return;
      } else {
        // No more empty cells or results - clear the queue
        (window as any).__pasteResults = undefined;
        if (shouldLog(10)) {
          console.log(`>>> [PASTE CONTINUE] All results pasted!`);
        }
      }
    } else {
      (window as any).__pasteResults = undefined;
    }

    setEntryCell(null);
    setTempGameResult(null);
  };

  const handleUpdatePlayerData = (
    playerRank: number,
    roundIndex: number,
    resultString: string,
  ) => {
    const parsedResult = updatePlayerGameData(
      resultString.replace(/_$/, ""),
      true,
    );
    if (parsedResult.isValid) {
      setTempGameResult({
        playerRank,
        round: roundIndex,
        resultString: parsedResult.resultString || resultString,
        parsedPlayer1Rank: parsedResult.parsedPlayer1Rank || 0,
        parsedPlayer2Rank: parsedResult.parsedPlayer2Rank || 0,
      });
    }
  };

  const Chess_Compare = (
    Row1: PlayerData,
    Row2: PlayerData,
    sortType: "last" | "first",
    _col_sel: number,
  ) => {
    const result1 = sortType === "last" ? Row1.lastName : Row1.firstName;
    const result2 = sortType === "last" ? Row2.lastName : Row2.firstName;

    if (result1 === "" || result1 === null) {
      return 1;
    }

    if (result2 === "" || result2 === null) {
      return -1;
    }

    if (result1 > result2) {
      return 1;
    }

    if (result1 < result2) {
      return -1;
    }

    return 0;
  };

  const handleSort = (
    sortMethod: "rank" | "nRating" | "rating" | "byLastName" | "byFirstName",
  ) => {
    setSortBy(sortMethod);

    const playersWithResults = players.map((player) => ({
      ...player,
      gameResults: player.gameResults || new Array(31).fill(null),
    }));

    playersWithResults.sort((a, b) => {
      if (sortMethod === "rank") {
        return a.rank - b.rank;
      } else if (sortMethod === "nRating") {
        // Pseudo-rating: eligible = nRating, ineligible = -nRating
        // Descending: highest + first, then lowest - first
        const pseudoA = a.trophyEligible !== false ? (a.nRating || 0) : -(a.nRating || 0);
        const pseudoB = b.trophyEligible !== false ? (b.nRating || 0) : -(b.nRating || 0);
        if (pseudoA !== pseudoB) return pseudoB - pseudoA;
        return a.rank - b.rank;
      } else if (sortMethod === "rating") {
        // Pseudo-rating: eligible = rating, ineligible = -rating
        // Descending: highest + first, then lowest - first
        const pseudoA = a.trophyEligible !== false ? (a.rating || 0) : -(a.rating || 0);
        const pseudoB = b.trophyEligible !== false ? (b.rating || 0) : -(b.rating || 0);
        if (pseudoA !== pseudoB) return pseudoB - pseudoA;
        return a.rank - b.rank;
      } else if (sortMethod === "byLastName") {
        const resultA = a.lastName || "";
        const resultB = b.lastName || "";
        if (resultA && !resultB) return 1;
        if (!resultA && resultB) return -1;
        if (!resultA && !resultB) return 0;
        if (resultA < resultB) return -1;
        if (resultA > resultB) return 1;
        return 0;
      } else if (sortMethod === "byFirstName") {
        const resultA = a.firstName || "";
        const resultB = b.firstName || "";
        if (resultA && !resultB) return 1;
        if (!resultA && resultB) return -1;
        if (!resultA && !resultB) return 0;
        if (resultA < resultB) return -1;
        if (resultA > resultB) return 1;
        return 0;
      }
      return 0;
    });

    setPlayers([...playersWithResults]);
    savePlayers(playersWithResults).catch((err) => {
      console.error("Failed to save sorted players:", err);
    });
  };
  const handleFileAction = (action: "load" | "export") => {
    if (shouldLog(10)) {
      console.log(`>>> [MENU ACTION] ${action}`);
    }
    switch (action) {
      case "load":
        fileInputRef.current?.click();
        break;
      case "export":
        exportPlayers();
        break;
    }
  };

  const handleSetZoom = (level: "50%" | "70%" | "100%" | "140%" | "200%") => {
    if (shouldLog(10)) {
      console.log(`>>> [MENU ACTION] Set zoom to ${level}`);
    }
    setZoomLevel(level);
    const zoomPercent = parseInt(level);
    setZoomLevelStorage(zoomPercent);
  };

  const handleBulkPaste = () => {
    if (shouldLog(10)) {
      console.log(">>> [MENU ACTION] Paste Multiple Results");
    }
    setShowBulkPasteDialog(true);
  };

  const handleApplyBulkResults = async (
    results: { playerRank: number; roundIndex: number; resultString: string; playerName?: string }[],
  ) => {
    if (shouldLog(10)) {
      console.log(`>>> [BULK PASTE] Applying ${results.length} entries`);
    }

    // Mark local changes if we're in server down mode
    if (isServerDownMode()) {
      markLocalChanges();
    }

    const updatedPlayers = (() => {
      const playersCopy = players.map((p) => ({ ...p }));
      for (const result of results) {
        const playerIndex = playersCopy.findIndex(
          (p) => p.rank === result.playerRank,
        );
        if (playerIndex !== -1) {
          const player = playersCopy[playerIndex];
          if (!player.gameResults) {
            player.gameResults = new Array(31).fill(null);
          }
          player.gameResults[result.roundIndex] = result.resultString;
        }
      }
      return playersCopy;
    })();

    setPlayers(updatedPlayers);
    await savePlayers(updatedPlayers);

    if (shouldLog(10)) {
      console.log(`>>> [BULK PASTE] Successfully applied ${results.length} entries`);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const INLINE_FIELD_ORDER = [
    "rank", "group", "lastName", "firstName", "rating", "nRating",
    "trophyEligible", "grade", "num_games", "attendance", "phone", "info", "school", "room"
  ];

  const normalizeTrophy = (text: string): boolean => {
    const trimmed = text.trim();
    if (trimmed.includes("-")) return false;
    return true;
  };

  const normalizePlayersTrophy = (players: PlayerData[]): PlayerData[] => {
    return players.map(p => ({ ...p, trophyEligible: p.trophyEligible !== false }));
  };

  const createPlayerFromMapped = (mapped: Record<string, string | number>, currentPlayers: PlayerData[]): PlayerData => {
    const lastPlayer = currentPlayers[currentPlayers.length - 1];
    const maxRank = currentPlayers.reduce((max, p) => Math.max(max, p.rank || 0), 0);
    
    return {
      rank: maxRank + 1,
      group: String(mapped.group || '').trim() || lastPlayer?.group || "",
      lastName: String(mapped.lastName || '').trim(),
      firstName: String(mapped.firstName || '').trim(),
    rating: typeof mapped.rating === 'number' ? mapped.rating : (parseInt(String(mapped.rating || '0')) || 1),
     nRating: typeof mapped.nRating === 'number' ? mapped.nRating : (parseInt(String(mapped.nRating || '0')) || 0),
      trophyEligible: String((mapped as any).trophyEligible || '').trim() === "-"
        ? false
        : (lastPlayer?.trophyEligible !== false),
      grade: String(mapped.grade || '').trim() || lastPlayer?.grade || "",
      num_games: typeof mapped.num_games === 'number' ? mapped.num_games : (parseInt(String(mapped.num_games || '0')) || 0),
      attendance: typeof mapped.attendance === 'number' ? mapped.attendance : (parseInt(String(mapped.attendance || '0')) || 0),
      phone: String(mapped.phone || '').trim() || lastPlayer?.phone || "",
      info: String(mapped.info || '').trim() || lastPlayer?.info || "",
      school: String(mapped.school || '').trim() || lastPlayer?.school || "",
      room: String(mapped.room || '').trim() || lastPlayer?.room || "",
      gameResults: ((mapped as any).gameResults as (string | null)[]) || new Array(31).fill(null),
    };
  };

  const handleInlinePaste = (pastedText: string, startColIndex: number, currentPlayers: PlayerData[]) => {
    const rows = pastedText.split('\n').filter(r => r.trim());
    
    if (rows.length <= 1) {
      return { createdPlayers: [] as PlayerData[], remainingCols: null as string[] | null };
    }
    
    const createdPlayers: PlayerData[] = [];
    let remainingCols: string[] | null = null;
    let accumulatedPlayers = [...currentPlayers];

    for (let i = 0; i < rows.length; i++) {
      const cols = rows[i].split('\t');
      const mapped: Record<string, string | number> = {};
      const gameResults: (string | null)[] = [];

      for (let j = 0; j < cols.length; j++) {
        const fieldIndex = startColIndex + j;
        if (fieldIndex < INLINE_FIELD_ORDER.length) {
          const field = INLINE_FIELD_ORDER[fieldIndex];
          if (field === "rank") continue;
          mapped[field] = cols[j].trim();
        } else {
          gameResults[fieldIndex - INLINE_FIELD_ORDER.length] = cols[j].trim() || null;
        }
      }

      ['rating', 'nRating', 'num_games', 'attendance'].forEach(f => {
        if (mapped[f]) {
          mapped[f] = parseInt(String(mapped[f])) || 0;
        }
      });

      (mapped as any).gameResults = gameResults.length ? gameResults : new Array(31).fill(null);

      const hasNames = String(mapped.lastName || '').trim() && String(mapped.firstName || '').trim();

      if (hasNames) {
        const newPlayer = createPlayerFromMapped(mapped, accumulatedPlayers);
        createdPlayers.push(newPlayer);
        accumulatedPlayers.push(newPlayer);
      } else if (i === rows.length - 1) {
        remainingCols = cols;
      }
    }

    return { createdPlayers, remainingCols };
  };

  const moveFocusDown = (currentCell: HTMLElement) => {
    const cellId = currentCell.getAttribute('data-cell');
    if (!cellId) return;
    const playerRank = parseInt(cellId.match(/player-(\d+)/)?.[1] || '0');
    const isGameCell = cellId.includes('-game-');
    
    if (isGameCell) {
      const gameRound = parseInt(cellId.match(/game-(\d+)/)?.[1] || '0');
      const nextPlayerRank = playerRank + 1;
      if (nextPlayerRank > players.length) return;
      const targetCell = document.querySelector(`[data-cell="player-${nextPlayerRank}-game-${gameRound}"]`) as HTMLElement;
      if (targetCell) targetCell.focus();
      return;
    }
    
    const lastNum = parseInt(cellId.match(/-(\d+)$/)?.[1] || '0');
    const nextPlayerRank = playerRank + 1;
    if (nextPlayerRank > players.length) return;
    
    if (lastNum === 3) {
      const targetCell = document.querySelector(`[data-cell="player-${nextPlayerRank}-2"]`) as HTMLElement;
      if (targetCell) targetCell.focus();
    } else {
      const targetCell = document.querySelector(`[data-cell="player-${nextPlayerRank}-${lastNum}"]`) as HTMLElement;
      if (targetCell) targetCell.focus();
    }
  };

  const moveFocus = (currentCell: HTMLElement, direction: 'next' | 'prev') => {
    const cellId = currentCell.getAttribute('data-cell');
    if (!cellId) return;
    const playerRank = parseInt(cellId.match(/player-(\d+)/)?.[1] || '0');
    const isGameCell = cellId.includes('-game-');
    const gameRound = parseInt(cellId.match(/game-(\d+)/)?.[1] || '0');
    let nextPlayerRank = playerRank;
    let nextCol = 0;
    let nextGameRound = gameRound;
    if (isGameCell) {
      nextGameRound = direction === 'next' ? gameRound + 1 : gameRound - 1;
      if (nextGameRound >= 31) {
        nextGameRound = 0;
        nextPlayerRank = direction === 'next' ? playerRank + 1 : playerRank - 1;
      }
      if (nextGameRound < 0) {
        nextGameRound = 30;
        nextPlayerRank = direction === 'next' ? playerRank + 1 : playerRank - 1;
      }
      if (nextPlayerRank < 1 || nextPlayerRank > players.length) return;
      const targetCell = document.querySelector(`[data-cell="player-${nextPlayerRank}-game-${nextGameRound}"]`) as HTMLElement;
      if (targetCell) targetCell.focus();
      return;
    }
    const lastNum = parseInt(cellId.match(/-(\d+)$/)?.[1] || '0');
    nextCol = direction === 'next' ? lastNum + 1 : lastNum - 1;
    if (nextCol >= INLINE_FIELD_ORDER.length) {
      nextPlayerRank = direction === 'next' ? playerRank + 1 : playerRank - 1;
      nextCol = 0;
    }
    if (nextCol < 0) {
      nextPlayerRank = direction === 'next' ? playerRank + 1 : playerRank - 1;
      nextCol = INLINE_FIELD_ORDER.length - 1;
    }
    if (nextPlayerRank < 1 || nextPlayerRank > players.length) return;
    const field = INLINE_FIELD_ORDER[nextCol];
    const trophyColIndex = field === 'trophyEligible' ? 6 : nextCol;
    const targetCell = document.querySelector(`[data-cell="player-${nextPlayerRank}-${trophyColIndex}"]`) as HTMLElement;
    if (targetCell) targetCell.focus();
  };

  const handleMainTablePaste = (e: any, playerRank: number, startCol: number) => {
    const text = e.clipboardData?.getData('text') || '';
    const rows = text.split('\n').filter((r: string) => r.trim());
    if (rows.length <= 1) return;
    e.preventDefault();
    const updatedPlayers = [...players];
    let col = startCol;
    for (let r = 0; r < rows.length; r++) {
      const cols = rows[r].split('\t');
      let playerIdx = updatedPlayers.findIndex(p => p.rank === playerRank + r);
      if (playerIdx < 0) continue;
      for (let c = 0; c < cols.length; c++) {
        const fieldIndex = col + c;
        if (fieldIndex >= INLINE_FIELD_ORDER.length) break;
        const field = INLINE_FIELD_ORDER[fieldIndex];
        if (field === 'rank' || field === 'trophyEligible') continue;
        const value = cols[c].trim();
        if (!value) continue;
        const targetPlayer = updatedPlayers[playerIdx];
        if (!targetPlayer) continue;
        if (field === 'rating' || field === 'nRating' || field === 'num_games' || field === 'attendance') {
          (targetPlayer as any)[field] = parseInt(value) || 0;
        } else {
          (targetPlayer as any)[field] = value;
        }
      }
      col = startCol;
    }
    setPlayers(updatedPlayers);
  };

  const handleGameCellPaste = (e: any, playerRank: number, startRound: number) => {
    const text = e.clipboardData?.getData('text') || '';
    const rows = text.split('\n').filter((r: string) => r.trim());
    if (rows.length <= 1) return;
    e.preventDefault();
    const updatedPlayers = [...players];
    const playerIdx = updatedPlayers.findIndex((p: PlayerData) => p.rank === playerRank);
    if (playerIdx < 0) return;
    const targetPlayer = updatedPlayers[playerIdx];
    const newResults = [...(targetPlayer.gameResults || new Array(31).fill(null))];
    for (let i = 0; i < rows.length && (startRound + i) < 31; i++) {
      newResults[startRound + i] = rows[i].trim() || null;
    }
    targetPlayer.gameResults = newResults;
    setPlayers(updatedPlayers);
  };

  const handleDeleteHiddenPlayers = () => {
    if (shouldLog(10)) {
      console.log(">>> [MENU ACTION] Delete Hidden Players");
    }
    const hiddenPlayers = players.filter(p => p.group?.toLowerCase().endsWith('x'));
    if (hiddenPlayers.length > 0) {
      setHiddenPlayersToDelete(hiddenPlayers);
      setDeleteAllPlayers(false);
    } else {
      setHiddenPlayersToDelete(players);
      setDeleteAllPlayers(true);
    }
    setCurrentDeleteIndex(0);
    setShowDeleteHiddenDialog(true);
  };

  const handleDeleteConfirm = () => {
    const current = hiddenPlayersToDelete[currentDeleteIndex];
    const remainingPlayers = players.filter(p => p.rank !== current.rank);
    setPlayers(remainingPlayers);
    savePlayers(remainingPlayers, true).catch((err) => {
      console.error("Failed to save after deleting player:", err);
    });
    setCurrentDeleteIndex(prev => {
      if (prev >= hiddenPlayersToDelete.length - 1) {
        setShowDeleteHiddenDialog(false);
        setHiddenPlayersToDelete([]);
        setDeleteAllPlayers(false);
        return 0;
      }
      return prev + 1;
    });
  };

  const handleDeleteSkip = () => {
    setCurrentDeleteIndex(prev => {
      if (prev >= hiddenPlayersToDelete.length - 1) {
        setShowDeleteHiddenDialog(false);
        setHiddenPlayersToDelete([]);
        setDeleteAllPlayers(false);
        return 0;
      }
      return prev + 1;
    });
  };

  const handleDeleteCancel = () => {
    setShowDeleteHiddenDialog(false);
    setHiddenPlayersToDelete([]);
    setCurrentDeleteIndex(0);
    setDeleteAllPlayers(false);
  };

  const handleAutoLetter = () => {
    if (shouldLog(10)) {
      console.log(">>> [MENU ACTION] Auto-Letter");
    }
    const updatedPlayers = players.map(p => {
      const nRating = p.nRating || 0;
      const isHidden = p.group?.toLowerCase().endsWith('x');
      let letter = "D";
      if (nRating >= 1200) letter = "A1";
      else if (nRating >= 1000) letter = "A";
      else if (nRating >= 800) letter = "B";
      else if (nRating >= 600) letter = "C";
      const newGroup = isHidden ? letter + "x" : letter;
      return { ...p, group: newGroup };
    });
    setPlayers(updatedPlayers);
    savePlayers(updatedPlayers, true).catch((err) => {
      console.error("Failed to save auto-letter:", err);
    });
    showToast(`Auto-lettered ${players.length} players`);
  };

  const handleAddPlayer = () => {
    if (shouldLog(10)) {
      console.log(">>> [MENU ACTION] Add Player");
    }
    setIsAddPlayerDialogOpen(true);
  };

  const handleAddPlayerSubmit = (
    playerData: Omit<PlayerData, "rank" | "nRating" | "gameResults">,
  ) => {
    // Mark local changes if we're in server down mode
    if (isServerDownMode()) {
      markLocalChanges();
    }

    setPlayers((prevPlayers) => {
      const maxRank = prevPlayers.reduce(
        (max, p) => Math.max(max, p.rank || 0),
        0,
      );
      const newRank = maxRank + 1;

      const newPlayer: PlayerData = {
        ...playerData,
        rank: newRank,
        nRating: Math.abs(playerData.rating || 1),
        trophyEligible: true,
        gameResults: new Array(31).fill(null),
      };

      const updatedPlayers = [...prevPlayers, newPlayer];
      updatedPlayers.sort((a, b) => a.rank - b.rank);

      savePlayers(updatedPlayers).catch((err) => {
        console.error("Failed to save added player:", err);
      });
      return updatedPlayers;
    });

    if (shouldLog(10)) {
      console.log(`New player added successfully`);
    }
  };

  const getFontSize = () => {
    switch (zoomLevel) {
      case "50%":
        return "0.5rem";
      case "70%":
        return "0.625rem";
      case "100%":
        return "0.875rem";
      case "140%":
        return "1.25rem";
      case "200%":
        return "1.75rem";
      default:
        return "0.875rem";
    }
  };

  const checkServerVersion = async (): Promise<boolean> => {
    const serverUrl = getServerUrl();
    if (!serverUrl) return true;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${serverUrl}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) return true;
      
      const data = await response.json();
      const clientVersion = import.meta.env.PACKAGE_VERSION;
      setServerVersion(data.version || '');
      
      // Check write health
      if (data.writeHealth && data.writeHealth.consecutiveFailures > 0) {
        const wh = data.writeHealth;
        setWriteErrors({
          count: wh.consecutiveFailures,
          message: wh.lastError || 'Write failed',
        });
      }
      
      return data.version === clientVersion;
    } catch {
      return true; // Server unreachable, allow proceeding
    }
  };

  const handleToggleAdmin = async () => {
    if (shouldLog(10)) {
      console.log(">>> [MENU ACTION] Toggle admin mode");
    }
    
    const myClientId = getClientId();
    
    if (!isAdmin) {
      // Attempting to enter admin mode
      
      // Local mode: no server configured, always allow immediately
      const serverUrl = getServerUrl();
      if (!serverUrl) {
        console.log('[ADMIN_LOCK] Local mode - entering admin mode directly');
        setIsAdmin(true);
        return;
      }
      
      // Check server version
      const versionsMatch = await checkServerVersion();
      if (!versionsMatch) {
        setShowVersionWarningDialog(true);
        return;
      }
      
      // Server mode: check lock status
      const lockInfo = await getAdminLockInfo();
      
      // Check if server is unreachable first
      if (lockInfo.serverReachable === false) {
        alert("Cannot reach admin server. Please check:\n\n- Server URL is correct\n- Server is running\n- Network connection is active\n\nServer: " + (serverUrl || 'unknown'));
        return;
      }
      
      if (lockInfo.locked && lockInfo.holderId !== myClientId) {
        // Show override dialog instead of alert
        setOverrideLockHolder(lockInfo.holderName || "Another user");
        setOverrideTimeout(Math.ceil((lockInfo.expiresAt! - Date.now()) / 1000));
        setShowOverrideDialog(true);
        return;
      }
      
      // Try to acquire lock normally first
      const acquired = await tryAcquireAdminLock();
      if (acquired) {
        setIsAdmin(true);
      } else {
        // Acquisition failed - check what's happening and offer force acquire
        const lockInfo2 = await getAdminLockInfo();
        
        if (lockInfo2.serverReachable === false) {
          alert("Cannot reach admin server. Please check:\n\n- Server URL is correct\n- Server is running\n- Network connection is active");
          return;
        }
        
        if (lockInfo2.locked && lockInfo2.holderId !== myClientId) {
          // Another user holds it - show override dialog
          setOverrideLockHolder(lockInfo2.holderName || "Another user");
          const expiresAt = lockInfo2.expiresAt;
          if (expiresAt && expiresAt > Date.now()) {
            setOverrideTimeout(Math.ceil((expiresAt - Date.now()) / 1000));
          } else {
            setOverrideTimeout(0); // Lock expired or no expiry info
          }
          setShowOverrideDialog(true);
        } else if (lockInfo2.locked && lockInfo2.holderId === myClientId) {
          // We hold the lock but acquire failed - force it
          const forced = await forceAcquireAdminLock();
          if (forced) {
            setIsAdmin(true);
          } else {
            alert("Failed to reacquire admin lock. Try refreshing the page.");
          }
        } else {
          // No lock held - try force acquire as last resort
          const forced = await forceAcquireAdminLock();
          if (forced) {
            setIsAdmin(true);
          } else {
            alert("Failed to acquire admin lock. Check the browser console for details.");
          }
        }
      }
    } else {
      // Exiting admin mode - release lock
      releaseAdminLock().catch(err => console.error('[ADMIN_LOCK] Failed to release lock:', err));
      setIsAdmin(false);
      localStorage.removeItem(getKeyPrefix() + 'ladder_admin_mode');
    }
  };

  const handleSplashEnterAdminMode = async () => {
    const serverUrl = splashServerUrl.trim();
    
    if (!serverUrl) {
      // Local mode - enter admin mode immediately
      setIsAdmin(true);
      return;
    }
    
    // Server mode - save settings and check version
    saveUserSettings({ server: serverUrl, apiKey: splashApiKey, debugMode: false });
    if (splashApiKey.trim()) {
      saveLastWorkingConfig(serverUrl, splashApiKey);
    }
    
    // Check server version
    const versionsMatch = await checkServerVersion();
    if (!versionsMatch) {
      setShowVersionWarningDialog(true);
      return;
    }
    
    const acquired = await tryAcquireAdminLock();
    if (acquired) {
      setIsAdmin(true);
    } else {
      const lockInfo = await getAdminLockInfo();
      if (lockInfo.serverReachable === false) {
        alert('Cannot reach admin server. Please check your connection.');
        return;
      }
      
      if (lockInfo.locked && lockInfo.holderId !== getClientId()) {
        setOverrideLockHolder(lockInfo.holderName || "Another user");
        setOverrideTimeout(Math.ceil((lockInfo.expiresAt! - Date.now()) / 1000));
        setShowOverrideDialog(true);
      } else {
        alert('Failed to acquire admin lock. Please check your API key and try again.');
      }
    }
  };

  const handleSplashConnect = () => {
    const trimmedServer = splashServerUrl.trim();
    
    // Save settings to localStorage before reloading
    saveUserSettings({ server: trimmedServer, apiKey: splashApiKey, debugMode: false });
    if (trimmedServer) {
      saveLastWorkingConfig(trimmedServer, splashApiKey);
    }
    
    console.log('[Splash] Connecting to server:', trimmedServer || '(local mode)');
    window.location.reload();
  };

  const exportPlayers = () => {
    if (shouldLog(10)) {
      console.log(`>>> [BUTTON PRESSED] Export - ${players.length} players`);
    }
    if (players.length === 0) {
      console.error("No players to export");
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    // Get everything before first space (handles underscores correctly)
    let titlePart = projectName.split(" ")[0];
    // Strip any existing timestamp suffix to avoid double timestamps
    titlePart = titlePart.replace(/_\d{4}-\d{2}-\d{2}(T\d{2}-\d{2}-\d{2}[^.]*)?$/, "");
    const filename = `${titlePart}_${timestamp}.tab`;

    const headerLine =
      `Group\tLast Name\tFirst Name\tRating\tRnk\tN Rate\tGr\tGms\tAttendance\tPhone\tInfo\tSchool\tRoom\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12\t13\t14\t15\t16\t17\t18\t19\t20\t21\t22\t23\t24\t25\t26\t27\t28\t29\t30\t31\tVersion ${import.meta.env.PACKAGE_VERSION}`;

    let output = headerLine + "\n";

    players.forEach((player) => {
      const gameResults = player.gameResults || new Array(31).fill(null);

      output += `${player.group || ""}\t${player.lastName || ""}\t${player.firstName || ""}\t${player.trophyEligible !== false ? player.rating : "-" + player.rating}\t${player.rank}\t${player.trophyEligible !== false ? player.nRating : "-" + player.nRating}\t${player.grade || ""}\t${player.num_games || 0}\t${player.attendance || ""}\t${player.phone || ""}\t${player.info || ""}\t${player.school || ""}\t${player.room || ""}`;

      output += "\t" + gameResults.map((r) => r || "").join("\t");
      output += "\n";
    });

    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (shouldLog(10)) {
      console.log(`Exported ${players.length} players to ${filename}`);
    }
  };

  if ((!players || players.length === 0) && !pendingImport && !pendingRestore) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>
        <h1>{projectName}</h1>
        <p style={{ marginTop: "1rem", fontSize: "1.125rem" }}>
          'No players loaded.'
        </p>
        
        {/* Server Connection Section */}
        <div
          style={{
            marginTop: "2rem",
            marginBottom: "2rem",
            padding: "1.5rem",
            backgroundColor: "#f8fafc",
            borderRadius: "0.5rem",
            border: "1px solid #e2e8f0",
            maxWidth: "500px",
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              marginBottom: "1rem",
              color: "#374151",
              fontSize: "0.875rem",
              fontWeight: "600",
            }}
          >
            <Server size={18} />
            <span>Connect to Server</span>
          </div>
          
          {/* Status messages */}
          {!hadExistingUserSettings && (
            <p
              style={{
                marginBottom: "0.5rem",
                fontSize: "0.875rem",
                color: "#64748b",
                fontStyle: "italic",
              }}
            >
              No previous server configuration found.
            </p>
          )}
          {!hasLocalPlayerData && (
            <p
              style={{
                marginBottom: "1rem",
                fontSize: "0.875rem",
                color: "#64748b",
                fontStyle: "italic",
              }}
            >
              No local player data found. Enter server details to connect, or load a file.
            </p>
          )}
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
            <input
              type="text"
              placeholder="Server URL (e.g., omen.com:3000)"
              value={splashServerUrl}
              onChange={(e) => setSplashServerUrl(e.target.value)}
              style={{
                padding: "0.5rem",
                border: "1px solid #d1d5db",
                borderRadius: "0.25rem",
                fontSize: "0.875rem",
              }}
            />
            <input
              type="password"
              placeholder="API Key (optional)"
              value={splashApiKey}
              onChange={(e) => setSplashApiKey(e.target.value)}
              style={{
                padding: "0.5rem",
                border: "1px solid #d1d5db",
                borderRadius: "0.25rem",
                fontSize: "0.875rem",
              }}
            />
          </div>
          
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={handleSplashConnect}
              style={{
                padding: "0.625rem 1.25rem",
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "0.25rem",
                fontSize: "0.875rem",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Connect
            </button>
            <button
              onClick={() => setShowSettings?.(true)}
              style={{
                padding: "0.625rem 1.25rem",
                backgroundColor: "white",
                color: "#374151",
                border: "1px solid #d1d5db",
                borderRadius: "0.25rem",
                fontSize: "0.875rem",
                cursor: "pointer",
                fontWeight: "500",
              }}
            >
              Settings
            </button>
          </div>
          
          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.75rem",
              color: "#64748b",
            }}
          >
            Leave Server URL empty for local mode (no server). Changes are auto-saved.
          </p>
        </div>
        
        {/* Local Options */}
        <div>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "1rem",
              cursor: "pointer",
              marginRight: "1rem",
            }}
          >
            Load File
          </button>
          <button
            onClick={() => {
              const samplePlayers = loadSampleData();
              setPlayers(samplePlayers);
              setSortBy(null);
            }}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#10b981",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            Load Sample Data
          </button>
          {!isAdmin && (
            <button
              onClick={handleSplashEnterAdminMode}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#8b5cf6",
                color: "white",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Enter Admin Mode
            </button>
          )}
        </div>
        
        {/* Drop Zone for .tab files */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const files = e.dataTransfer.files;
            if (files.length > 0) {
              const file = files[0];
              const ext = file.name.split('.').pop()?.toLowerCase();
              if (ext === 'tab' || ext === 'txt' || ext === 'xls') {
                setLastFile(file);
                loadPlayers(file);
              } else {
                alert('Please drop a .tab, .xls, or .txt file');
              }
            }
          }}
          style={{
            marginTop: "1.5rem",
            padding: "2rem",
            border: "2px dashed #cbd5e1",
            borderRadius: "0.5rem",
            backgroundColor: "#f8fafc",
            textAlign: "center",
            color: "#64748b",
            fontSize: "0.875rem",
            transition: "border-color 0.2s, background-color 0.2s",
          }}
        >
          <div style={{ marginBottom: "0.5rem", fontSize: "1.5rem" }}>📄</div>
          <p style={{ margin: 0, fontWeight: "500", color: "#374151" }}>Drop .tab, .xls, or .txt file here</p>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem" }}>or use the Load File button above</p>
        </div>
        
        {/* Hidden file input for splash screen */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".txt,.tab,.xls"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setLastFile(file);
              loadPlayers(file);
            }
          }}
        />
      </div>
    );
  }

  // Retry server connection
  const handleRetryConnection = async () => {
    setIsRetryingConnection(true);
    setRetryErrorMessage(null);
    
    try {
      const isReachable = await testServerConnection();
      
      if (isReachable) {
        console.log('[ServerDownDialog] Server is now reachable!');
        onDismissServerDown?.();
        // Reload to reconnect properly
        setTimeout(() => window.location.reload(), 500);
      } else {
        setRetryErrorMessage('Server is still unreachable. Please try again later.');
        setIsRetryingConnection(false);
      }
    } catch (error) {
      setRetryErrorMessage('Failed to connect to server. Please try again later.');
      setIsRetryingConnection(false);
    }
  };

  // Server-down blocking dialog - shown at startup when server is unreachable
  if (showServerDownBlocking) {
    const userSettingsJson = localStorage.getItem('bughouse-ladder-user-settings');
    let configuredServerUrl = '';
    if (userSettingsJson) {
      const userSettings = JSON.parse(userSettingsJson);
      configuredServerUrl = userSettings.server?.trim() || '';
    }

    return (
      <>
        {/* Admin lock override dialog - rendered first to appear on top */}
        {showOverrideDialog && (
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
              zIndex: 10001,
            }}
          >
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "0.75rem",
                padding: "2rem",
                maxWidth: "450px",
                width: "90%",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              }}
            >
              <div style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span>🔄</span> Admin Mode Lock Held
              </div>
              
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                  Admin mode is currently held by:
                </div>
                <div style={{ fontSize: "1.125rem", fontWeight: 500, color: "#1e293b" }}>
                  "{overrideLockHolder}"
                </div>
              </div>
              
              <div style={{ marginBottom: "1.5rem", padding: "0.75rem", backgroundColor: "#f8fafc", borderRadius: "0.5rem" }}>
                <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
                  Available in: <strong style={{ color: "#1e293b", fontSize: "1.125rem" }}>{overrideTimeout}</strong> seconds
                </div>
              </div>
              
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
                <button
                  onClick={async () => {
                    setShowOverrideDialog(false);
                    const acquired = await tryAcquireAdminLock();
                    if (acquired) {
                      setIsAdmin(true);
                    }
                  }}
                  disabled={overrideTimeout > 0}
                  style={{
                    flex: 1,
                    padding: "0.75rem 1rem",
                    backgroundColor: overrideTimeout > 0 ? "#cbd5e1" : "#3b82f6",
                    color: "white",
                    border: "none",
                    borderRadius: "0.5rem",
                    fontWeight: 600,
                    cursor: overrideTimeout > 0 ? "not-allowed" : "pointer",
                    fontSize: "1rem",
                  }}
                >
                  Wait ({overrideTimeout}s)
                </button>
                
                <button
                  onClick={async () => {
                    setShowOverrideDialog(false);
                    const acquired = await forceAcquireAdminLock();
                    if (acquired) {
                      setIsAdmin(true);
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "0.75rem 1rem",
                    backgroundColor: "#ef4444",
                    color: "white",
                    border: "none",
                    borderRadius: "0.5rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "1rem",
                  }}
                >
                  Override Lock
                </button>
              </div>
              
              <div style={{ color: "#f59e0b", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span>⚠️</span> Dangerous: allows multiple admins simultaneously!
              </div>
            </div>
          </div>
         )}

        {showVersionWarningDialog && (
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
              zIndex: 10002,
            }}
          >
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "0.75rem",
                padding: "2rem",
                maxWidth: "450px",
                width: "90%",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              }}
            >
              <div style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span>⚠️</span> Version Mismatch Detected
              </div>
              
              <div style={{ marginBottom: "1.5rem", padding: "1rem", backgroundColor: "#fef3c7", borderRadius: "0.5rem", border: "1px solid #fbbf24" }}>
                <div style={{ fontSize: "0.875rem", color: "#92400e", marginBottom: "0.5rem" }}>
                  Client version and server version do not match.
                </div>
                <div style={{ fontSize: "0.875rem", color: "#92400e" }}>
                  Client: <strong>{import.meta.env.PACKAGE_VERSION}</strong> &nbsp;|&nbsp; Server: <strong>{serverVersion}</strong>
                </div>
              </div>
              
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  onClick={() => setShowVersionWarningDialog(false)}
                  style={{
                    flex: 1,
                    padding: "0.75rem 1rem",
                    backgroundColor: "#ef4444",
                    color: "white",
                    border: "none",
                    borderRadius: "0.5rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "1rem",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setShowVersionWarningDialog(false);
                    const serverUrl = getServerUrl();
                    if (!serverUrl) {
                      setIsAdmin(true);
                      return;
                    }
                    const lockInfo = await getAdminLockInfo();
                    if (lockInfo.serverReachable === false) {
                      alert("Cannot reach admin server. Please check:\n\n- Server URL is correct\n- Server is running\n- Network connection is active\n\nServer: " + serverUrl);
                      return;
                    }
                    if (lockInfo.locked && lockInfo.holderId !== getClientId()) {
                      setOverrideLockHolder(lockInfo.holderName || "Another user");
                      setOverrideTimeout(Math.ceil((lockInfo.expiresAt! - Date.now()) / 1000));
                      setShowOverrideDialog(true);
                      return;
                    }
                    const acquired = await tryAcquireAdminLock();
                    if (acquired) {
                      setIsAdmin(true);
                    } else {
                      const lockInfo2 = await getAdminLockInfo();
                      if (lockInfo2.serverReachable === false) {
                        alert("Cannot reach admin server. Please check your connection.");
                        return;
                      }
                      if (lockInfo2.locked && lockInfo2.holderId !== getClientId()) {
                        setOverrideLockHolder(lockInfo2.holderName || "Another user");
                        const expiresAt = lockInfo2.expiresAt;
                        if (expiresAt && expiresAt > Date.now()) {
                          setOverrideTimeout(Math.ceil((expiresAt - Date.now()) / 1000));
                        } else {
                          setOverrideTimeout(0);
                        }
                        setShowOverrideDialog(true);
                      } else if (lockInfo2.locked && lockInfo2.holderId === getClientId()) {
                        const forced = await forceAcquireAdminLock();
                        if (forced) {
                          setIsAdmin(true);
                        } else {
                          alert("Failed to reacquire admin lock. Try refreshing the page.");
                        }
                      } else {
                        const forced = await forceAcquireAdminLock();
                        if (forced) {
                          setIsAdmin(true);
                        } else {
                          alert("Failed to acquire admin lock. Check the browser console for details.");
                        }
                      }
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: "0.75rem 1rem",
                    backgroundColor: "#f59e0b",
                    color: "white",
                    border: "none",
                    borderRadius: "0.5rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: "1rem",
                  }}
                >
                  Proceed Anyway
                </button>
              </div>
            </div>
          </div>
        )}


        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "0.75rem",
              padding: "2rem",
              maxWidth: "500px",
              width: "90%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "1.5rem",
              }}
            >
              <Server size={32} color="#f59e0b" />
              <h2
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "700",
                  color: "#1f2937",
                  margin: 0,
                }}
              >
                Server Unavailable
              </h2>
            </div>

            <div
              style={{
                marginBottom: "1.5rem",
                padding: "1rem",
                backgroundColor: "#fffbeb",
                borderLeft: "4px solid #f59e0b",
                borderRadius: "0.25rem",
              }}
            >
              <p style={{ fontSize: "0.95rem", color: "#92400e", margin: 0, lineHeight: "1.5" }}>
                The configured server is currently unreachable.
              </p>
              {configuredServerUrl && (
                <p style={{ fontSize: "0.875rem", color: "#78350f", marginTop: "0.5rem", margin: 0 }}>
                  <strong>Server:</strong> {configuredServerUrl}
                </p>
              )}
            </div>

            <p style={{ fontSize: "0.9rem", color: "#374151", marginBottom: "1.5rem", lineHeight: "1.5" }}>
              You can continue working in local mode. Changes will be saved locally and synced when the server becomes available again.
            </p>

            {/* Retry error message */}
            {retryErrorMessage && (
              <div
                style={{
                  marginBottom: "1rem",
                  padding: "0.75rem",
                  backgroundColor: "#fee2e2",
                  borderLeft: "4px solid #ef4444",
                  borderRadius: "0.25rem",
                }}
              >
                <p style={{ fontSize: "0.875rem", color: "#b91c1c", margin: 0 }}>
                  {retryErrorMessage}
                </p>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                onClick={() => {
                  console.log('[ServerDownDialog] Proceeding in local mode');
                  if (splashServerUrl.trim()) {
                    saveLastWorkingConfig(splashServerUrl.trim(), splashApiKey);
                    saveUserSettings({ server: '', apiKey: '', debugMode: false });
                    console.log('[ServerDownDialog] Saved last working config, clearing server URL for local mode');
                  }
                  onDismissServerDown?.();
                  setTimeout(() => window.location.reload(), 300);
                }}
                style={{
                  padding: "0.875rem 1.5rem",
                  backgroundColor: "#f59e0b",
                  color: "white",
                  border: "none",
                  borderRadius: "0.375rem",
                  fontSize: "1rem",
                  cursor: "pointer",
                  fontWeight: "600",
                }}
              >
                Proceed in Local Mode
              </button>
              
              <button
                onClick={() => {
                  console.log('[ServerDownDialog] Opening settings, hiding blocking dialog');
                  onDismissServerDown?.();
                  setShowSettings?.(true);
                }}
                style={{
                  padding: "0.875rem 1.5rem",
                  backgroundColor: "white",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  fontSize: "1rem",
                  cursor: "pointer",
                  fontWeight: "600",
                }}
              >
                Change Server Settings
              </button>
              
              <button
                onClick={handleRetryConnection}
                disabled={isRetryingConnection}
                style={{
                  padding: "0.875rem 1.5rem",
                  backgroundColor: isRetryingConnection ? "#9ca3af" : "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "0.375rem",
                  fontSize: "1rem",
                  cursor: isRetryingConnection ? "not-allowed" : "pointer",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                }}
              >
                {isRetryingConnection ? (
                  <>
                    <span style={{ animation: "spin 1s linear infinite" }}>⏳</span>
                    Retrying...
                  </>
                ) : (
                  'Retry Connection'
                )}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Admin lock override dialog - rendered first to appear on top */}
      {showOverrideDialog && (
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
            zIndex: 10000,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "0.75rem",
              padding: "2rem",
              maxWidth: "450px",
              width: "90%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>🔄</span> Admin Mode Lock Held
            </div>
            
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                Admin mode is currently held by:
              </div>
              <div style={{ fontSize: "1.125rem", fontWeight: 500, color: "#1e293b" }}>
                "{overrideLockHolder}"
              </div>
            </div>
            
            <div style={{ marginBottom: "1.5rem", padding: "0.75rem", backgroundColor: "#f8fafc", borderRadius: "0.5rem" }}>
              <div style={{ fontSize: "0.875rem", color: "#64748b" }}>
                Available in: <strong style={{ color: "#1e293b", fontSize: "1.125rem" }}>{overrideTimeout}</strong> seconds
              </div>
            </div>
            
            <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
              <button
                onClick={async () => {
                  setShowOverrideDialog(false);
                  const acquired = await tryAcquireAdminLock();
                  if (acquired) {
                    setIsAdmin(true);
                  }
                }}
                disabled={overrideTimeout > 0}
                style={{
                  flex: 1,
                  padding: "0.75rem 1rem",
                  backgroundColor: overrideTimeout > 0 ? "#cbd5e1" : "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "0.5rem",
                  fontWeight: 600,
                  cursor: overrideTimeout > 0 ? "not-allowed" : "pointer",
                  fontSize: "1rem",
                }}
              >
                Wait ({overrideTimeout}s)
              </button>
              
              <button
                onClick={async () => {
                  setShowOverrideDialog(false);
                  const acquired = await forceAcquireAdminLock();
                  if (acquired) {
                    setIsAdmin(true);
                  }
                }}
                style={{
                  flex: 1,
                  padding: "0.75rem 1rem",
                  backgroundColor: "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: "0.5rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontSize: "1rem",
                }}
              >
                Override Lock
              </button>
            </div>
            
            <div style={{ color: "#f59e0b", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>⚠️</span> Dangerous: allows multiple admins simultaneously!
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: "1rem" }}>
      {/* Server down mode indicator */}
      {currentMode === 'server_down' && (
        <div style={{
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '0.375rem',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: getFontSize(),
        }}>
          <span style={{ color: '#92400e', fontWeight: '600' }}>⚠️ Server Down Mode</span>
          <span style={{ color: '#78350f' }}>Only game entry is available. Use Recalculate_Save when server is back online.</span>
        </div>
      )}
      {/* Mobile menu trigger */}
      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        onFileAction={handleFileAction}
        onSort={handleSort}
        onRecalculateRatings={recalculateRatings}
        onCheckErrors={() => checkGameErrors()}
        onToggleAdmin={handleToggleAdmin}
        onSetZoom={handleSetZoom}
        onOpenSettings={() => setShowSettings?.(true)}
        onAddPlayer={handleAddPlayer}
        onEnterGames={handleEnterGamesMenu}
        onRestoreBackup={isAdmin ? () => setShowRestoreBackupDialog(true) : undefined}
        onDeleteHiddenPlayers={isAdmin ? handleDeleteHiddenPlayers : undefined}
        onAutoLetter={isAdmin ? handleAutoLetter : undefined}
        isAdmin={isAdmin}
        projectName={projectName}
        onSetTitle={(newTitle) => {
          setProjectName(newTitle);
          setProjectNameStorage(newTitle);
        }}
      />

      {/* Version mismatch warning banner */}
      {versionMismatch && (
        <div style={{
          backgroundColor: "#fef3c7",
          border: "1px solid #fbbf24",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.25rem" }}>⚠️</span>
            <span style={{ fontSize: "0.875rem", color: "#92400e" }}>
              Server version mismatch detected. Client and server versions do not match.
            </span>
          </div>
          <button
            onClick={() => setVersionMismatch?.(false)}
            style={{
              padding: "0.25rem 0.75rem",
              backgroundColor: "#f59e0b",
              color: "white",
              border: "none",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            Dismiss
          </button>
        </div>
       )}

       {/* Write error warning banner */}
       {writeErrors && (
        <div style={{
          backgroundColor: "#fef2f2",
          border: "1px solid #fecaca",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.25rem" }}>🔴</span>
            <div>
              <span style={{ fontSize: "0.875rem", color: "#991b1b", fontWeight: 600 }}>
                Server write failed ({writeErrors.count} consecutive)
              </span>
              <div style={{ fontSize: "0.75rem", color: "#b91c1c" }}>
                {writeErrors.message}
              </div>
            </div>
          </div>
          <button
            onClick={() => setWriteErrors(null)}
            style={{
              padding: "0.25rem 0.75rem",
              backgroundColor: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Desktop combined header with menu and title */}
      <div className="desktop-header-hidden" style={{ display: "flex" }}>
        <MenuBar
          onFileAction={handleFileAction}
          onSort={handleSort}
          onRecalculateRatings={recalculateRatings}
          onCheckErrors={() => checkGameErrors()}
          onToggleAdmin={handleToggleAdmin}
          onSetZoom={handleSetZoom}
          onOpenSettings={() => setShowSettings?.(true)}
          onAddPlayer={handleAddPlayer}
          onBulkPaste={handleBulkPaste}
          onEnterGames={handleEnterGamesMenu}
          onRestoreBackup={isAdmin ? () => setShowRestoreBackupDialog(true) : undefined}
          onDeleteHiddenPlayers={isAdmin ? handleDeleteHiddenPlayers : undefined}
          onAutoLetter={isAdmin ? handleAutoLetter : undefined}
          isAdmin={isAdmin}
          isWide={zoomLevel === "140%"}
          zoomLevel={zoomLevel}
          projectName={projectName}
          onProjectNameChange={(name) => {
            setProjectName(name);
            setProjectNameStorage(name);
          }}
          onSetTitle={(newTitle) => {
            setProjectName(newTitle);
            setProjectNameStorage(newTitle);
          }}
          playerCount={players.length}
          serverUrl={splashServerUrl}
          hasAdminApiKey={!!splashApiKey && splashApiKey.trim().length > 0}
        />
      </div>

      {/* Mobile header with menu trigger */}
      <header
        className="mobile-menu-trigger"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
          color: "white",
          padding: "1rem 2rem",
          marginBottom: "0.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>{projectName}</span>
            <span style={{ fontSize: "0.875rem", opacity: 0.8 }}>{getVersionString()}</span>
          </h1>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <div>
            <span
              style={{ fontSize: "0.75rem", color: "rgba(255, 255, 255, 0.7)" }}
            >
              Total Players
            </span>
            <div style={{ fontSize: "1rem", fontWeight: "600" }}>
              {players.length}
            </div>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            style={{
              background: "rgba(255, 255, 255, 0.1)",
              color: "white",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              padding: "0.5rem",
              borderRadius: "0.25rem",
              cursor: "pointer",
            }}
          >
            <MenuIcon size={24} />
          </button>
        </div>
      </header>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".txt,.tab,.xls"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setLastFile(file);
            loadPlayers(file);
          }
        }}
      />

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 767px) {
          .mobile-menu-trigger {
            display: flex !important;
          }
          .desktop-header-hidden {
            display: none !important;
          }
        }
        @media (min-width: 768px) {
          .mobile-menu-trigger {
            display: none !important;
          }
          .desktop-header-hidden {
            display: flex !important;
          }
        }
      `}</style>

      <style>{`
        .ladder-table thead th {
          position: sticky;
          top: 0;
          z-index: 10;
        }
      `}</style>

      <div
        style={{
          overflow: "auto",
          maxHeight: "calc(100dvh - 80px)",
          border: "1px solid #cbd5e1",
          borderRadius: "0.5rem",
        }}
      >
        <table
          className="ladder-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: getFontSize(),
          }}
        >
          <thead>
            <tr>
              <th
                key="head-rank"
                style={{
                  padding: "0.5rem 0.75rem",
                  textAlign: "left",
                  fontWeight: "500",
                  borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: "#0f172a",
                  color: "white",
                }}
              >
                Rnk
              </th>
              <th
                key="head-group"
                style={{
                  padding: "0.5rem 0.75rem",
                  textAlign: "left",
                  fontWeight: "500",
                  borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: "#0f172a",
                  color: "white",
                }}
              >
                Group
              </th>
              <th
                key="head-lastName"
                style={{
                  padding: "0.5rem 0.75rem",
                  textAlign: "left",
                  fontWeight: "500",
                  borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: "#0f172a",
                  color: "white",
                }}
              >
                Last Name
              </th>
              <th
                key="head-firstName"
                style={{
                  padding: "0.5rem 0.75rem",
                  textAlign: "left",
                  fontWeight: "500",
                  borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: "#0f172a",
                  color: "white",
                }}
              >
                First Name
              </th>
              <th
                key="head-rating"
                style={{
                  padding: "0.5rem 0.75rem",
                  textAlign: "left",
                  fontWeight: "500",
                  borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: "#0f172a",
                  color: "white",
                }}
              >
                Previous Rating
              </th>
              <th
                key="head-nRating"
                style={{
                  padding: "0.5rem 0.75rem",
                  textAlign: "left",
                  fontWeight: "500",
                  borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                  backgroundColor: "#0f172a",
                  color: "white",
                }}
              >
                 New Rating
               </th>
               <th
                 key="head-trophy"
                 style={{
                   padding: "0.5rem 0.75rem",
                   textAlign: "center",
                   fontWeight: "500",
                   borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                   backgroundColor: "#0f172a",
                   color: "white",
                   width: "40px",
                 }}
               >
                 T
               </th>
               {isAdmin && (
                <>
                  <th
                    key="head-grade"
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "left",
                      fontWeight: "500",
                      borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                      backgroundColor: "#0f172a",
                      color: "white",
                    }}
                  >
                    Gr
                  </th>
                  <th
                    key="head-num_games"
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "left",
                      fontWeight: "500",
                      borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                      backgroundColor: "#0f172a",
                      color: "white",
                    }}
                  >
                    Gms
                  </th>
                  <th
                    key="head-attendance"
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "left",
                      fontWeight: "500",
                      borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                      backgroundColor: "#0f172a",
                      color: "white",
                      width: "60px",
                    }}
                  >
                    Attend
                  </th>
                  <th
                    key="head-phone"
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "left",
                      fontWeight: "500",
                      borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                      backgroundColor: "#0f172a",
                      color: "white",
                    }}
                  >
                    Phone
                  </th>
                  <th
                    key="head-info"
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "left",
                      fontWeight: "500",
                      borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                      backgroundColor: "#0f172a",
                      color: "white",
                      width: "30px",
                    }}
                  >
                    I
                  </th>
                  <th
                    key="head-school"
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "left",
                      fontWeight: "500",
                      borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                      backgroundColor: "#0f172a",
                      color: "white",
                      width: "30px",
                    }}
                  >
                    S
                  </th>
                  <th
                    key="head-room"
                    style={{
                      padding: "0.5rem 0.75rem",
                      textAlign: "left",
                      fontWeight: "500",
                      borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                      backgroundColor: "#0f172a",
                      color: "white",
                      width: "30px",
                    }}
                  >
                    R
                  </th>
                </>
              )}
              {Array.from({ length: 31 }).map((_, round) => (
                <th
                  key={`head-round-${round}`}
                  style={{
                    padding: "0.5rem 0.75rem",
                    textAlign: "center",
                    fontWeight: "500",
                    borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
                    backgroundColor: "#0f172a",
                    color: "white",
                  }}
                >
                  Round {round + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(isAdmin ? players : players.filter(p => !p.group?.toLowerCase().endsWith('x'))).map((player, rowIndex) => {
              const gameResults =
                player.gameResults || new Array(31).fill(null);

              return (
                <tr
                  key={player.rank}
                  style={{
                    backgroundColor:
                      rowIndex % 2 >= 1 ? "#f8fafc" : "transparent",
                  }}
                >
                 {["rank","group","lastName","firstName","rating","nRating","grade","num_games","attendance","phone","info","school","room"]
                     .filter((_, i) => i < (isAdmin ? 13 : 6))
                     .map((field, col) => {
                       const cellValue = field === "rank" ? player.rank : 
                                          field === "group" ? player.group :
                                          field === "lastName" ? player.lastName :
                                          field === "firstName" ? player.firstName :
                                          field === "rating" ? (player.rating || "") :
                                          field === "nRating" ? (player.nRating || "") :
                                          field === "grade" ? player.grade :
                                          field === "num_games" ? player.num_games :
                                          field === "attendance" ? player.attendance :
                                          field === "phone" ? player.phone :
                                          field === "info" ? player.info :
                                          field === "school" ? player.school :
                                          field === "room" ? player.room : "";
                        if (field === "nRating") {
                          return (
                            <>
                              <td
                                key={`${rowIndex}-${col}`}
                           style={{
                             padding: "0.5rem 0.75rem",
                             borderBottom: "1px solid #e2e8f0",
                             verticalAlign: "middle",
                             borderRight: "1px solid #e2e8f0",
                             backgroundColor:
                               rowIndex % 2 >= 1 ? "#f8fafc" : "transparent",
                           }}
                         >
                           {isAdmin ? (
                              <span
                                contentEditable={true}
                                suppressContentEditableWarning={true}
                                data-cell={`player-${player.rank}-5`}
                            onBlur={(e) => {
                                    const value = (e.target.textContent || "").replace(/\n/g, "");
                                    const val = parseInt(value) || 0;
                                    e.target.textContent = String(Math.abs(val));
                                    setPlayers((prevPlayers) => {
                                      const updatedPlayers = [...prevPlayers];
                                      const targetPlayer = updatedPlayers.find(
                                        (p) => p.rank === player.rank,
                                      );
                                      if (!targetPlayer) return prevPlayers;
                                      targetPlayer.nRating = Math.abs(val);
                                      targetPlayer.trophyEligible = true;
                                      return updatedPlayers;
                                    });
                                  }}
                            onPaste={(e) => {
                                const text = e.clipboardData.getData('text').trim();
                                if (text === "-") {
                                  return;
                                }
                                e.preventDefault();
                                setPlayers((prevPlayers) => {
                                  const updatedPlayers = [...prevPlayers];
                                  const targetPlayer = updatedPlayers.find(
                                    (p) => p.rank === player.rank,
                                  );
                                  if (!targetPlayer) return prevPlayers;
                                  targetPlayer.nRating = parseInt(text) || 0;
                                  targetPlayer.trophyEligible = true;
                                  return updatedPlayers;
                                });
                              }}
                          onKeyDown={(e) => {
                                   if (e.key === "Enter") {
                                     e.preventDefault();
                                     const current = e.currentTarget as HTMLElement;
                                     current.blur();
                                     setTimeout(() => {
                                       moveFocusDown(current);
                                     }, 10);
                                   } else if (e.key === "Tab") {
                                    e.preventDefault();
                                    const current = e.currentTarget as HTMLElement;
                                    current.blur();
                                    setTimeout(() => {
                                      const targetCol = e.shiftKey ? 4 : 6;
                                      const targetCell = document.querySelector(`[data-cell="player-${player.rank}-${targetCol}"]`) as HTMLElement;
                                      if (targetCell) targetCell.focus();
                                    }, 10);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    e.currentTarget.blur();
                                  }
                                }}
                              >
                                {cellValue}
                              </span>
                           ) : (
                              cellValue
                            )}
                          </td>
                          <td
                             key={`${rowIndex}-trophy`}
                             style={{
                               padding: "0.5rem 0.75rem",
                               borderBottom: "1px solid #e2e8f0",
                               verticalAlign: "middle",
                               borderRight: "1px solid #e2e8f0",
                               backgroundColor: rowIndex % 2 >= 1 ? "#f8fafc" : "transparent",
                               textAlign: "center",
                               width: "40px",
                             }}
                           >
                           {isAdmin ? (
                                 <span
                                   contentEditable={true}
                                   suppressContentEditableWarning={true}
                                   data-cell={`player-${player.rank}-6`}
                                   style={{ cursor: "text" }}
                                   onPaste={(e) => {
                                     const text = e.clipboardData.getData('text').trim();
                                     e.preventDefault();
                                     setPlayers((prevPlayers) => {
                                       const updatedPlayers = [...prevPlayers];
                                       const targetPlayer = updatedPlayers.find((p) => p.rank === player.rank);
                                       if (!targetPlayer) return prevPlayers;
                                       targetPlayer.trophyEligible = normalizeTrophy(text);
                                        return updatedPlayers;
                                      });
                                    }}
                                  onKeyDown={(e) => {
                                       if (e.key === "Enter") {
                                         e.preventDefault();
                                         const current = e.currentTarget as HTMLElement;
                                         const value = (current.textContent || "").trim();
                                         setPlayers((prevPlayers) => {
                                           const updatedPlayers = [...prevPlayers];
                                           const targetPlayer = updatedPlayers.find((p) => p.rank === player.rank);
                                           if (!targetPlayer) return prevPlayers;
                                           targetPlayer.trophyEligible = normalizeTrophy(value);
                                           return updatedPlayers;
                                         });
                                         current.blur();
                                         setTimeout(() => {
                                           moveFocusDown(current);
                                         }, 10);
                                       } else if (e.key === "Tab") {
                                         e.preventDefault();
                                         const current = e.currentTarget as HTMLElement;
                                         const value = (current.textContent || "").trim();
                                         setPlayers((prevPlayers) => {
                                           const updatedPlayers = [...prevPlayers];
                                           const targetPlayer = updatedPlayers.find((p) => p.rank === player.rank);
                                           if (!targetPlayer) return prevPlayers;
                                           targetPlayer.trophyEligible = normalizeTrophy(value);
                                           return updatedPlayers;
                                         });
                                         current.blur();
                                         setTimeout(() => {
                                           const targetCol = e.shiftKey ? 5 : 7;
                                           const targetCell = document.querySelector(`[data-cell="player-${player.rank}-${targetCol}"]`) as HTMLElement;
                                           if (targetCell) targetCell.focus();
                                         }, 10);
                                       } else if (e.key === "Escape") {
                                        e.preventDefault();
                                        e.currentTarget.blur();
                                      }
                                    }}
                                    onBlur={(e) => {
                                      const value = (e.target.textContent || "").trim();
                                      setPlayers((prevPlayers) => {
                                        const updatedPlayers = [...prevPlayers];
                                        const targetPlayer = updatedPlayers.find((p) => p.rank === player.rank);
                                        if (!targetPlayer) return prevPlayers;
                                        targetPlayer.trophyEligible = normalizeTrophy(value);
                                        return updatedPlayers;
                                      });
                                    }}
                                 >
                                   {player.trophyEligible !== false ? "+" : "-"}
                                 </span>
                               ) : (
                                 player.trophyEligible !== false ? "+" : "-"
                               )}
                           </td>
                        </>
                      );
                    }
                    const narrowFields = ["attendance", "info", "school", "room"];
                     const cellWidth = isAdmin && narrowFields.includes(field) ? "40px" : undefined;
                     return (
                       <td
                         key={`${rowIndex}-${col}`}
                         style={{
                           padding: "0.5rem 0.75rem",
                           borderBottom: "1px solid #e2e8f0",
                           verticalAlign: "middle",
                           borderRight: "1px solid #e2e8f0",
                           backgroundColor:
                             rowIndex % 2 >= 1 ? "#f8fafc" : "transparent",
                           width: cellWidth,
                         }}
                       >
                      {isAdmin ? (
                            <span
                              contentEditable={field !== "rank"}
                              suppressContentEditableWarning={true}
                              data-cell={`player-${player.rank}-${INLINE_FIELD_ORDER.indexOf(field)}`}
                              onBlur={(e) => {
                                 let value = (e.target.textContent || "").replace(/\n/g, "");
                                 const numericFields = ["rating", "nRating", "num_games", "attendance"];
                                 if (numericFields.includes(field)) {
                                   const numVal = parseInt(value) || 0;
                                   e.target.textContent = String(numVal);
                                 } else {
                                   e.target.textContent = value;
                                 }
                                 setPlayers((prevPlayers) => {
                                   const updatedPlayers = [...prevPlayers];
                                   const targetPlayer = updatedPlayers.find(
                                     (p) => p.rank === player.rank,
                                   );
                                   if (!targetPlayer) return prevPlayers;
                                   switch (field) {
                                     case "group": targetPlayer.group = value; break;
                                     case "lastName": targetPlayer.lastName = value; break;
                                     case "firstName": targetPlayer.firstName = value; break;
                                     case "rating": targetPlayer.rating = parseInt(value) || 0; break;
                                     case "grade": targetPlayer.grade = value; break;
                                     case "num_games": targetPlayer.num_games = parseInt(value) || 0; break;
                                     case "attendance": targetPlayer.attendance = parseInt(value) || 0; break;
                                     case "phone": targetPlayer.phone = value; break;
                                     case "info": targetPlayer.info = value; break;
                                     case "school": targetPlayer.school = value; break;
                                     case "room": targetPlayer.room = value; break;
                                   }
                                   return updatedPlayers;
                                 });
                               }}
                            onPaste={(e) => {
                              const text = e.clipboardData.getData('text');
                              const rows = text.split('\n').filter(r => r.trim());
                              if (rows.length <= 1) return;
                              e.preventDefault();
                              handleMainTablePaste(e, player.rank, INLINE_FIELD_ORDER.indexOf(field));
                            }}
                           onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                   e.preventDefault();
                                   const current = e.currentTarget as HTMLElement;
                                   current.blur();
                                   setTimeout(() => {
                                     moveFocusDown(current);
                                   }, 10);
                                 } else if (e.key === "Tab") {
                                  e.preventDefault();
                                  const current = e.currentTarget as HTMLElement;
                                  current.blur();
                                  setTimeout(() => {
                                    moveFocus(current, e.shiftKey ? 'prev' : 'next');
                                  }, 10);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
                              }}
                            >
                              {cellValue}
                            </span>
                        ) : (
                          cellValue
                        )}
                      </td>
                    );
                  })}
                {gameResults.map((result, gCol) => {
                     const displayValue = getCellDisplayValue(player.rank, gCol, result);
                     const tempResult = tempGameResult &&
                         tempGameResult.playerRank === player.rank &&
                         tempGameResult.round === gCol
                       ? tempGameResult.resultString
                       : "";
                     return (
                       <td
                         key={`game-${player.rank}-${gCol}`}
                         style={{
                           padding: "0.5rem 0.75rem",
                           borderBottom: "1px solid #e2e8f0",
                           verticalAlign: "middle",
                           borderRight: "1px solid #e2e8f0",
                           backgroundColor:
                             entryCell &&
                             entryCell.playerRank === player.rank &&
                             entryCell.round === gCol
                               ? "#fef3c7"
                               : rowIndex % 2 >= 1
                                 ? "#f8fafc"
                                 : "transparent",
                           fontSize: getFontSize(),
                           cursor: isAdmin ? "default" : "pointer",
                           borderColor:
                             entryCell &&
                             entryCell.playerRank === player.rank &&
                             entryCell.round === gCol
                               ? "#f59e0b"
                               : tempGameResult &&
                                   tempGameResult.playerRank === player.rank &&
                                   tempGameResult.round === gCol
                                 ? "#3b82f6"
                                 : "#e2e8f0",
                         }}
                         >
                           {isAdmin ? (
                             // Admin mode: always allow editing any game result cell
                             <span
                               contentEditable={true}
                               suppressContentEditableWarning={true}
                               data-cell={`player-${player.rank}-game-${gCol}`}
                               style={{ cursor: "text" }}
                               onClick={() => {
                                 setEntryCell({
                                   playerRank: player.rank,
                                   round: gCol,
                                 });
                               }}
                               onPaste={(e) => {
                                 const text = e.clipboardData.getData('text');
                                 const rows = text.split('\n').filter(r => r.trim());
                                 if (rows.length <= 1) return;
                                 e.preventDefault();
                                 handleGameCellPaste(e, player.rank, gCol);
                               }}
                              onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const current = e.currentTarget as HTMLElement;
                                    current.blur();
                                    setTimeout(() => {
                                      moveFocus(current, 'next');
                                    }, 10);
                                  } else if (e.key === "Tab") {
                                    e.preventDefault();
                                    const current = e.currentTarget as HTMLElement;
                                    current.blur();
                                    setTimeout(() => {
                                      moveFocus(current, e.shiftKey ? 'prev' : 'next');
                                    }, 10);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    e.currentTarget.blur();
                                  }
                                }}
                                onBlur={(e) => {
                                  const value = e.target.textContent || "";
                                  setPlayers((prevPlayers) => {
                                    const updatedPlayers = [...prevPlayers];
                                    const targetPlayer = players.find(
                                      (p) => p.rank === player.rank,
                                    );
                                    if (!targetPlayer) return prevPlayers;
                                    const newResults = [...(targetPlayer.gameResults || new Array(31).fill(null))];
                                    newResults[gCol] = value.trim() || null;
                                    targetPlayer.gameResults = newResults;
                                    return updatedPlayers;
                                  });
                                }}
                             >
                                 {displayValue}
                               </span>
                             ) : (
                               // User mode: only editable when entryCell points to this cell
                               <span
                                 contentEditable={!!(entryCell && entryCell.playerRank === player.rank && entryCell.round === gCol)}
                                 suppressContentEditableWarning={true}
                                 data-cell={`player-${player.rank}-game-${gCol}`}
                                 style={{ cursor: "text" }}
                                onClick={() => {
                                  const result = players.find(p => p.rank === player.rank)?.gameResults?.[gCol] || '';

                                  if (result.endsWith('_')) {
                                    const emptyCell = findFirstEmptyCell();
                                    if (emptyCell) {
                                      setEntryCell(emptyCell);
                                      return;
                                    }
                                  }

                                  setEntryCell({
                                     playerRank: player.rank,
                                     round: gCol,
                                   });
                                }}
                                onPaste={(e) => {
                                  const text = e.clipboardData.getData('text');
                                  const rows = text.split('\n').filter(r => r.trim());
                                  if (rows.length <= 1) return;
                                  e.preventDefault();
                                  handleGameCellPaste(e, player.rank, gCol);
                                }}
                              onKeyDown={(e) => {
                                   if (e.key === "Enter") {
                                     e.preventDefault();
                                     const current = e.currentTarget as HTMLElement;
                                     current.blur();
                                     setTimeout(() => {
                                       moveFocusDown(current);
                                     }, 10);
                                   } else if (e.key === "Tab") {
                                     e.preventDefault();
                                     const current = e.currentTarget as HTMLElement;
                                     current.blur();
                                     setTimeout(() => {
                                       moveFocus(current, e.shiftKey ? 'prev' : 'next');
                                     }, 10);
                                   } else if (e.key === "Escape") {
                                     e.preventDefault();
                                     e.currentTarget.blur();
                                   }
                                 }}
                               onBlur={(e) => {
                                 const value = e.target.textContent || "";
                                 setPlayers((prevPlayers) => {
                                   const updatedPlayers = [...prevPlayers];
                                   const targetPlayer = updatedPlayers.find(
                                     (p) => p.rank === player.rank,
                                   );
                                   if (!targetPlayer) return prevPlayers;
                                   const newResults = [...(targetPlayer.gameResults || new Array(31).fill(null))];
                                   newResults[gCol] = value.trim() || null;
                                   targetPlayer.gameResults = newResults;
                                   return updatedPlayers;
                                 });
                               }}
                             >
                               {displayValue}{tempResult}
                             </span>
                           )}
                        </td>
                      );
                    })}
                  {Array.from({
                    length: Math.max(0, 20 - gameResults.length),
                  }).map((_, emptyCol) => (
                    <td
                      key={`empty-${player.rank}-${emptyCol}-${isAdmin}`}
                      style={{
                        padding: "0.5rem 0.75rem",
                        borderBottom: "1px solid #e2e8f0",
                        verticalAlign: "middle",
                        backgroundColor:
                          rowIndex % 2 >= 1 ? "#f8fafc" : "transparent",
                      }}
                    ></td>
                  ))}
                </tr>
              );
            })}
        {isAdmin && (
               <tr style={{ backgroundColor: "#f0f9ff" }}>
                 {["rank","group","lastName","firstName","rating","nRating","trophyEligible","grade","num_games","attendance","phone","info","school","room"].map((field, colIndex) => {
                     const isEditable = field !== "rank";
                      if (field === "trophyEligible") {
                         return (
                           <td
                             key={`empty-trophy-${isAdmin}`}
                             data-empty-cell={6}
                             contentEditable={true}
                             suppressContentEditableWarning={true}
                             onPaste={(e) => {
                                const text = e.clipboardData.getData('text').trim();
                                e.preventDefault();
                                setEmptyPlayerRow(prev => ({
                                  ...prev,
                                  trophyEligible: normalizeTrophy(text)
                                }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const value = (e.currentTarget as HTMLElement).textContent?.trim() || "";
                                  setEmptyPlayerRow(prev => ({
                                    ...prev,
                                    trophyEligible: normalizeTrophy(value)
                                  }));
                                  (document.querySelector('[data-empty-cell="7"]') as HTMLElement)?.focus();
                                } else if (e.key === "Tab") {
                                  e.preventDefault();
                                  const value = (e.currentTarget as HTMLElement).textContent?.trim() || "";
                                  setEmptyPlayerRow(prev => ({
                                    ...prev,
                                    trophyEligible: normalizeTrophy(value)
                                  }));
                                  const targetCol = e.shiftKey ? 5 : 7;
                                  (document.querySelector(`[data-empty-cell="${targetCol}"]`) as HTMLElement)?.focus();
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
                              }}
                              onBlur={(e) => {
                                const value = (e.target.textContent || "").trim();
                                setEmptyPlayerRow(prev => ({
                                  ...prev,
                                  trophyEligible: normalizeTrophy(value)
                                }));
                              }}
                             style={{
                               textAlign: "center",
                               borderBottom: "2px solid #3b82f6",
                               color: "#94a3b8",
                               fontStyle: "italic",
                               fontSize: "0.875rem",
                               width: "40px",
                               cursor: "text",
                             }}
                           >
                             {emptyPlayerRow.trophyEligible !== false ? "+" : "-"}
                           </td>
                         );
                       }
                      return (
                       <td
                           key={`empty-${colIndex}-${isAdmin}`}
                           data-empty-cell={colIndex}
                           contentEditable={isEditable}
                           suppressContentEditableWarning={true}
                           onPaste={(e) => {
                             if (!isEditable) return;
                             const text = e.clipboardData.getData('text');
                             const result = handleInlinePaste(text, colIndex, players);
                            
                            if (result.createdPlayers.length > 0) {
                              e.preventDefault();
                              const updatedPlayers = [...players, ...result.createdPlayers];
                              setPlayers(updatedPlayers);
                              savePlayers(updatedPlayers, true).catch((err) => {
                                console.error("Failed to save added players:", err);
                              });
                              showToast(`${result.createdPlayers.length} player${result.createdPlayers.length > 1 ? 's' : ''} added`);
                              
                              if (result.remainingCols) {
                                const newGameResults = Array(31).fill(null);
                                const newEmptyRow = {
                                  firstName: "", lastName: "", group: "", rating: 0, nRating: 0,
                                  trophyEligible: true, grade: "", num_games: 0, attendance: 0,
                                  phone: "", info: "", school: "", room: "",
                                  gameResults: newGameResults,
                                } as typeof emptyPlayerRow;
                                
                                const lastPlayer = players[players.length - 1];
                                for (let j = 0; j < result.remainingCols.length; j++) {
                                  const fieldIndex = colIndex + j;
                                  if (fieldIndex < INLINE_FIELD_ORDER.length) {
                                    const field = INLINE_FIELD_ORDER[fieldIndex];
                                    if (field !== "rank") {
                                      if (field === "rating" || field === "nRating" || field === "num_games" || field === "attendance") {
                                        (newEmptyRow as any)[field] = parseInt(result.remainingCols[j]) || 0;
                                      } else {
                                        (newEmptyRow as any)[field] = result.remainingCols[j].trim();
                                      }
                                    }
                                  }
                                }
                                
                                if (!newEmptyRow.group && lastPlayer?.group) newEmptyRow.group = lastPlayer.group;
                                if (!newEmptyRow.grade && lastPlayer?.grade) newEmptyRow.grade = lastPlayer.grade;
                                if (!newEmptyRow.phone && lastPlayer?.phone) newEmptyRow.phone = lastPlayer.phone;
                                if (!newEmptyRow.info && lastPlayer?.info) newEmptyRow.info = lastPlayer.info;
                                if (!newEmptyRow.school && lastPlayer?.school) newEmptyRow.school = lastPlayer.school;
                                if (!newEmptyRow.room && lastPlayer?.room) newEmptyRow.room = lastPlayer.room;
                                
                                setEmptyPlayerRow(newEmptyRow);
                                emptyPlayerRowRef.current = newEmptyRow;
                                
                                document.querySelectorAll('[data-empty-cell]').forEach((cell) => {
                                  cell.textContent = '';
                                });
                                
                                const firstFilledCol = result.remainingCols.findIndex((c, idx) => {
                                  const field = INLINE_FIELD_ORDER[colIndex + idx];
                                  if (!field || field === "rank") return false;
                                  return (newEmptyRow as any)[field] && String((newEmptyRow as any)[field]).trim();
                                });
                                const focusCol = firstFilledCol >= 0 ? colIndex + firstFilledCol + 1 : colIndex + 1;
                                const focusCell = document.querySelector(`[data-empty-cell="${focusCol}"]`) as HTMLElement;
                                if (focusCell) focusCell.focus();
                              }
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && e.ctrlKey) {
                              e.preventDefault();
                              const currentValues = { ...emptyPlayerRowRef.current };
                              if ((currentValues.firstName || "").trim() && (currentValues.lastName || "").trim()) {
                                const gameData = currentValues as typeof emptyPlayerRow & { rank?: number };
                                const newPlayer: PlayerData = {
                                   rank: 0,
                                   nRating: Math.abs(currentValues.nRating || 1),
                                   trophyEligible: emptyPlayerRowRef.current.trophyEligible !== false,
                                   gameResults: currentValues.gameResults,
                                  group: gameData.group,
                                  lastName: gameData.lastName,
                                  firstName: gameData.firstName,
                                  rating: gameData.rating,
                                  grade: gameData.grade,
                                  num_games: gameData.num_games,
                                  attendance: gameData.attendance,
                                  phone: gameData.phone,
                                  info: gameData.info,
                                  school: gameData.school,
                                  room: gameData.room,
                                };
                                const maxRank = players.reduce((max, p) => Math.max(max, p.rank || 0), 0);
                                const rankedPlayer = { ...newPlayer, rank: maxRank + 1 };
                                const updatedPlayers = [...players, rankedPlayer];
                                setPlayers(updatedPlayers);
                                savePlayers(updatedPlayers, true).catch((err) => {
                                  console.error("Failed to save added player:", err);
                                });
                                const emptyReset = {
                                  firstName: "", lastName: "", group: "", rating: 0, nRating: 0,
                                  trophyEligible: true, grade: "", num_games: 0, attendance: 0,
                                  phone: "", info: "", school: "", room: "",
                                  gameResults: Array(31).fill(null),
                                } as typeof emptyPlayerRow;
                                setEmptyPlayerRow(emptyReset);
                                emptyPlayerRowRef.current = emptyReset;
                                document.querySelectorAll('[data-empty-cell]').forEach((cell) => {
                                  cell.textContent = '';
                                });
                                const groupCell = document.querySelector('[data-empty-cell="1"]') as HTMLElement;
                                if (groupCell) groupCell.focus();
                                showToast(`${updatedPlayers.length} player(s) in ladder`);
                              }
                              return;
                            }
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const nextCol = colIndex + 1;
                              const nextCell = document.querySelector(`[data-empty-cell="${nextCol}"]`) as HTMLElement;
                              if (nextCell) {
                                nextCell.focus();
                              }
                            } else if (e.key === "Tab") {
                              e.preventDefault();
                              const targetCol = e.shiftKey ? colIndex - 1 : colIndex + 1;
                              const targetCell = document.querySelector(`[data-empty-cell="${targetCol}"]`) as HTMLElement;
                              if (targetCell) {
                                targetCell.focus();
                              }
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                         onBlur={(e) => {
                           if (!isEditable || !e.target.textContent) return;

                           console.log('[EMPTY ROW] onBlur triggered, field:', field, 'value:', e.target.textContent);
                           console.log('[EMPTY ROW] current emptyPlayerRowRef:', JSON.stringify(emptyPlayerRowRef.current));
                           console.log('[EMPTY ROW] current players count:', players.length);

                           const value = (e.target.textContent || "").replace(/\n/g, "");
                          
                          // Build updated state using ref to get latest values across all fields
                          const currentValues = { ...emptyPlayerRowRef.current };
                          const updated = { ...currentValues, [field]: value };
                          
                          let result: typeof emptyPlayerRow = { ...updated };
                          if (field === "rating" || field === "nRating" || field === "num_games" || field === "attendance") {
                            const numVal = parseInt(value) || 0;
                            result = { ...result, [field]: numVal };
                          }
                          
                          console.log('[EMPTY ROW] after update:', JSON.stringify(result));
                          
                        // When both firstName and lastName are filled, create player and reset row
                          if ((result.firstName || "").trim() && (result.lastName || "").trim()) {
                            console.log('[EMPTY ROW] Both names filled - creating player');
                            const gameData = result as typeof emptyPlayerRow & { rank?: number };
                          const newPlayer: PlayerData = {
                               rank: 0,
                               nRating: Math.abs(result.nRating || 1),
                               trophyEligible: true,
                               gameResults: result.gameResults,
                              group: gameData.group,
                              lastName: gameData.lastName,
                              firstName: gameData.firstName,
                              rating: gameData.rating,
                              grade: gameData.grade,
                              num_games: gameData.num_games,
                              attendance: gameData.attendance,
                              phone: gameData.phone,
                              info: gameData.info,
                              school: gameData.school,
                              room: gameData.room,
                            };
                            
                            // Compute new rank from current players
                            const maxRank = players.reduce((max, p) => Math.max(max, p.rank || 0), 0);
                            const rankedPlayer = { ...newPlayer, rank: maxRank + 1 };
                            const updatedPlayers = [...players, rankedPlayer];
                            
                            console.log('[EMPTY ROW] maxRank:', maxRank, 'newRank:', maxRank + 1);
                            console.log('[EMPTY ROW] new player object:', JSON.stringify(rankedPlayer));
                            console.log('[EMPTY ROW] updatedPlayers length:', updatedPlayers.length);
                            
                            setPlayers(updatedPlayers);
                             savePlayers(updatedPlayers, true).catch((err) => {
                               console.error("Failed to save added player:", err);
                             });
                            
                         // Reset emptyPlayerRow state and ref (not enough for contentEditable cells - React
                           // skips updating their textContent after they've been made editable)
                           console.log('[EMPTY ROW] Resetting empty player row');
                          const emptyReset = {
                              firstName: "",
                              lastName: "",
                              group: "",
                              rating: 0,
                              nRating: 0,
                              trophyEligible: true,
                              grade: "",
                             num_games: 0,
                             attendance: 0,
                             phone: "",
                             info: "",
                             school: "",
                             room: "",
                             gameResults: Array(31).fill(null),
                           } as typeof emptyPlayerRow;
                           setEmptyPlayerRow(emptyReset);
                           
                           // Also update the ref so subsequent blur handlers see clean state
                           emptyPlayerRowRef.current = emptyReset;
                           
                           // Clear all empty row cells directly in DOM (React doesn't update contentEditable textContent)
                           document.querySelectorAll('[data-empty-cell]').forEach((cell) => {
                             cell.textContent = '';
                           });
                           console.log('[EMPTY ROW] Cleared all empty row cells in DOM');
                           
                           // Move focus to group field of the new empty row
                           const groupCell = document.querySelector('[data-empty-cell="1"]') as HTMLElement;
                           if (groupCell) {
                             groupCell.focus();
                             console.log('[EMPTY ROW] Focused group cell for next player entry');
                           }
                           
                           return; // Skip setEmptyPlayerRow update since we already called it above
                          }
                          
                          // Normal case: just update the empty row field
                          setEmptyPlayerRow(result);
                        }}
                        style={{
                          padding: "0.5rem 0.75rem",
                          borderBottom: "2px solid #3b82f6",
                          color: "#94a3b8",
                          fontStyle: "italic",
                          fontSize: "0.875rem",
                        }}
                      >
                        {field === "rank" ? (
                          <span style={{ color: "#3b82f6", fontWeight: 600 }}>
                            {players.length + 1}
                          </span>
                        ) : field === "rating" || field === "nRating" || field === "num_games" || field === "attendance" ? (
                          emptyPlayerRow[field as keyof typeof emptyPlayerRow]
                        ) : (
                          emptyPlayerRow[field as keyof typeof emptyPlayerRow] || ""
                        )}
                      </td>
                    );
                  })}
                {/* Game result columns */}
                {Array.from({ length: 31 }).map((_, roundIndex) => (
                  <td
                    key={`empty-round-${roundIndex}-${isAdmin}`}
                    data-empty-cell={14 + roundIndex}
                    contentEditable={true}
                    suppressContentEditableWarning={true}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData('text');
                      const values = text.split('\n').filter(r => r.trim());
                      
                      if (values.length <= 1) {
                        return;
                      }
                      
                      e.preventDefault();
                      const newResults = [...emptyPlayerRow.gameResults];
                      for (let i = 0; i < values.length && (roundIndex + i) < 31; i++) {
                        newResults[roundIndex + i] = values[i].trim() || null;
                      }
                      setEmptyPlayerRow(prev => ({ ...prev, gameResults: newResults }));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const nextCol = 13 + roundIndex + 1;
                        const nextCell = document.querySelector(`[data-empty-cell="${nextCol}"]`) as HTMLElement;
                        if (nextCell) {
                          nextCell.focus();
                        }
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.textContent || "";
                      setEmptyPlayerRow((prev) => {
                        const newResults = [...prev.gameResults];
                        newResults[roundIndex] = value.trim() || null;
                        return { ...prev, gameResults: newResults };
                      });
                    }}
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderBottom: "2px solid #3b82f6",
                      textAlign: "center",
                      fontSize: getFontSize(),
                      cursor: "text",
                    }}
                  >
                    {emptyPlayerRow.gameResults[roundIndex] || "\u00A0"}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(isRecalculating || isWalkthrough) && (
        <ErrorDialog
          key={`error-dialog-${isWalkthrough ? walkthroughIndex : "recalc"}`}
          error={isWalkthrough ? null : walkthroughErrors[walkthroughIndex]}
          players={players}
          mode={
            isWalkthrough
              ? "walkthrough"
              : isRecalculating
                ? "recalculate"
                : "error-correction"
          }
          entryCell={{
            playerRank: isWalkthrough
              ? getNonBlankCells()[walkthroughIndex]?.playerRank ||
                walkthroughIndex + 1
              : (isRecalculating
                  ? walkthroughErrors[walkthroughIndex]?.playerRank
                  : currentError?.playerRank) || 0,
            round: isWalkthrough
              ? (getNonBlankCells()[walkthroughIndex]?.round ??
                walkthroughIndex)
              : (isRecalculating
                  ? walkthroughErrors[walkthroughIndex]?.resultIndex
                  : currentError?.resultIndex) || 0,
          }}
          existingValue={
            isWalkthrough
              ? (() => {
                  const cell = getNonBlankCells()[walkthroughIndex];
                  if (!cell) return "";
                  return (
                    players.find((p) => p.rank === cell.playerRank)
                      ?.gameResults?.[cell.round] || ""
                  );
                })()
              : isRecalculating && walkthroughErrors[walkthroughIndex]
                ? walkthroughErrors[
                    walkthroughIndex
                  ].originalString?.toUpperCase()
                : entryCell
                  ? players
                      .find((p) => p.rank === entryCell.playerRank)
                      ?.gameResults?.[entryCell.round]?.toUpperCase() || ""
                  : undefined
          }
          totalRounds={
            isWalkthrough
              ? countNonBlankRounds()
              : isRecalculating
                ? walkthroughErrors.length
                : countNonBlankRounds()
          }
          walkthroughErrors={isRecalculating ? walkthroughErrors : undefined}
          walkthroughIndex={
            isWalkthrough || isRecalculating ? walkthroughIndex : undefined
          }
          onWalkthroughNext={
            isWalkthrough || isRecalculating
              ? isWalkthrough
                ? handleWalkthroughNextForReview
                : handleWalkthroughNext
              : undefined
          }
          onWalkthroughPrev={
            isWalkthrough || isRecalculating
              ? isWalkthrough
                ? handleWalkthroughPrevForReview
                : handleWalkthroughPrev
              : undefined
          }
          onClose={() => {
            handleCorrectionCancel();
            setIsWalkthrough(false);
          }}
          onSubmit={handleCorrectionSubmit}
          onClearCell={clearCurrentCell}
          onUpdatePlayerData={handleUpdatePlayerData}
          isAdmin={isAdmin}
          onAddPlayer={handleAddPlayer}
          debugMode={debugMode}
        />
      )}
      {entryCell &&
        !isRecalculating &&
        !isWalkthrough &&
        walkthroughErrors.length === 0 && (
          <ErrorDialog
            key={`${entryCell.playerRank}-${entryCell.round}`}
            error={null}
            players={players}
            mode={isEnterGamesMode ? "enter-games" : "game-entry"}
            entryCell={entryCell}
            existingValue={
              players.find((p) => p.rank === entryCell.playerRank)
                ?.gameResults?.[entryCell.round] || undefined
            }
            onClose={() => {
              if (isEnterGamesMode) {
                handleEnterGamesClose();
              } else {
                setEntryCell(null);
                setTempGameResult(null);
              }
            }}
            onSubmit={handleGameEntrySubmit}
            onEnterRecalculateSave={handleEnterRecalculateSave}
            onClearCell={clearCurrentCell}
            onUpdatePlayerData={handleUpdatePlayerData}
            isAdmin={isAdmin}
            onAddPlayer={handleAddPlayer}
            debugMode={debugMode}
          />
        )}
      {currentError && (
        <div
          style={{
            position: "fixed",
            bottom: "1rem",
            right: "1rem",
            backgroundColor: "#f59e0b",
            color: "white",
            padding: "1rem",
            borderRadius: "0.5rem",
            zIndex: 999,
          }}
        >
          <button
            onClick={() => completeRatingCalculation()}
            style={{
              background: "white",
              color: "#f59e0b",
              border: "none",
              padding: "0.5rem 1rem",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            Continue with corrections
          </button>
        </div>
      )}

      {/* Add Player Dialog */}
      <AddPlayerDialog
        isOpen={isAddPlayerDialogOpen}
        onClose={() => setIsAddPlayerDialogOpen(false)}
        onAdd={handleAddPlayerSubmit}
        currentPlayerCount={players.length}
      />

      {/* Bulk Paste Dialog */}
      {showBulkPasteDialog && (
        <BulkPasteDialog
          players={players}
          onClose={() => setShowBulkPasteDialog(false)}
          onApplyResults={handleApplyBulkResults}
        />
      )}

      {/* Restore Backup Dialog */}
      {showRestoreBackupDialog && (
        <RestoreBackupDialog
          onClose={() => setShowRestoreBackupDialog(false)}
          onRestore={handleRestoreBackup}
        />
      )}

      {/* Import Confirmation Dialog (Admin mode) */}
      {pendingImport && (
        <>
          {rankLoadErrors.length > 0 && (
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
                zIndex: 999,
              }}
              onClick={() => setRankLoadErrors([])}
            >
              <div
                style={{
                  backgroundColor: "#fef2f2",
                  border: "2px solid #ef4444",
                  borderRadius: "0.5rem",
                  padding: "1.5rem",
                  maxWidth: "500px",
                  width: "90%",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 style={{ fontSize: "1.125rem", fontWeight: "600", color: "#991b1b", marginBottom: "1rem" }}>
                  ⚠ Rank Errors Detected
                </h2>
                <ul style={{ margin: "0 0 1rem 1rem", fontSize: "0.875rem", color: "#7f1d1d" }}>
                  {rankLoadErrors.map((err, i) => (
                    <li key={i} style={{ marginBottom: "0.25rem" }}>{err}</li>
                  ))}
                </ul>
                <p style={{ fontSize: "0.75rem", color: "#991b1b", marginBottom: "1rem" }}>
                  Ranks were not modified. You may still accept the import.
                </p>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setRankLoadErrors([])}
                    style={{
                      padding: "0.5rem 1rem",
                      background: "#ef4444",
                      border: "none",
                      borderRadius: "0.25rem",
                      cursor: "pointer",
                      fontSize: "0.875rem",
                      color: "white",
                      fontWeight: "600",
                    }}
                  >
                    Dismiss & View Import
                  </button>
                </div>
              </div>
            </div>
          )}
          <PreviewDialog
            title="Confirm File Import"
            players={pendingImport.players}
            extraInfo={[
              { label: "File", value: pendingImport.filename },
              { label: "Players", value: pendingImport.playerCount },
              { label: "Rounds filled", value: pendingImport.totalRoundsFilled },
              { label: "Games played", value: `~${pendingImport.totalGamesPlayed}` },
            ]}
            cancelLabel="Decline"
            confirmLabel="Accept & Save to Server"
            onCancel={handleDeclineImport}
            onConfirm={handleConfirmImport}
          />
        </>
      )}

     {pendingRestore && (
        <PreviewDialog
          title="Confirm Backup Restore"
          players={pendingRestore.players}
          extraInfo={[
            { label: "Backup", value: pendingRestore.backupFilename },
            { label: "Players", value: pendingRestore.players.length },
          ]}
          cancelLabel="Cancel"
          confirmLabel="Restore & Save"
          onCancel={handleDeclineRestore}
          onConfirm={handleConfirmRestore}
        />
      )}

      {/* Delete Hidden Player Dialog */}
      {showDeleteHiddenDialog && hiddenPlayersToDelete.length > 0 && (
        <DeleteHiddenPlayerDialog
          isOpen={showDeleteHiddenDialog}
          onClose={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          onSkip={handleDeleteSkip}
          player={hiddenPlayersToDelete[currentDeleteIndex]}
          remainingCount={hiddenPlayersToDelete.length}
          processedCount={currentDeleteIndex + 1}
          deleteAllPlayers={deleteAllPlayers}
        />
      )}
      
      {/* Toast notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: '20px', right: '20px',
          backgroundColor: '#10b981', color: 'white',
          padding: '0.75rem 1.5rem', borderRadius: '0.5rem',
          zIndex: 9999, fontSize: '0.875rem', fontWeight: '600',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          animation: 'fadeInOut 2s ease-in-out'
        }}>
          {toastMessage}
        </div>
      )}
      
      {/* CSS animation for retry spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(10px); }
          10% { opacity: 1; transform: translateY(0); }
          90% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-10px); }
        }
      `}</style>
    </div>
    </>
  );
}
