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
import { Menu as MenuIcon } from "lucide-react";
import { shouldLog } from "../utils/debug";
import { getVersionString } from "../utils/mode";
import { getKeyPrefix, startBatch, endBatch, saveToServer } from "../services/storageService";
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
}

export default function LadderForm({
  setShowSettings,
  triggerWalkthrough,
  setTriggerWalkthrough,
  onSetRecalculateRef,
}: LadderFormProps = {}) {
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [zoomLevel, setZoomLevel] = useState<
    "50%" | "70%" | "100%" | "140%" | "200%"
  >("100%");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<
    "rank" | "nRating" | "rating" | "byLastName" | "byFirstName" | null
  >(null);
  const [projectName, setProjectName] = useState<string>(
    "Bughouse Chess Ladder",
  );
  const [lastFile, setLastFile] = useState<File | null>(null);
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

  // VB6 Line: 894 - Initialize with storage data or sample data
  useEffect(() => {
    const initializeData = async () => {
      try {
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

        const players = await getPlayers();
        if (players && players.length > 0) {
          const playersWithResults = players.map((player) => ({
            ...player,
            gameResults: player.gameResults || new Array(31).fill(null),
          }));
          setPlayers(playersWithResults);
          setSortBy(null);
          if (shouldLog(10)) {
            console.log(
              `[LadderForm] Loaded ${playersWithResults.length} players from storage`,
            );
          }

          // Load settings
          const settings = getSettings();
          if (settings) {
            console.log(`[LadderForm] Loaded settings from storage:`, settings);
          }

          return;
        }
      } catch (err) {
        console.error("Failed to load from storage:", err);
      }

      // No storage data - use sample data
      const samplePlayers = loadSampleData();
      if (shouldLog(10)) {
        console.log(
          `[LadderForm] No storage data found. Loaded ${samplePlayers.length} players from sample data`,
        );
      }
      samplePlayers.forEach((player) => {
        if (shouldLog(3)) {
          console.log(
            `[LadderForm] Sample player: Rank=${player.rank}, Name=${player.firstName} ${player.lastName}, Rating=${player.rating}, Games=${player.num_games}`,
          );
        }
      });

      setPlayers(samplePlayers);
      setSortBy(null);
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
        const line = lines[i].trim();

        if (!line) continue;

        if (line.startsWith("Group")) continue;

        let cols = line.split("\t");
        if (cols[0].length > 2) {
          // if (line.startsWith('\t')){
          //             console.log('adding leading space to line:', line);
          cols.unshift(" ");
        }
        //if (parts.length < 14) continue;  // Need at least columns 0-13

        // const lastChar = cols[cols.length - 1];
        // const hasTail = lastChar === '' ? cols.length - 1 : cols.length;

        const player: PlayerData = {
          rank: cols[4] ? parseInt(cols[4]) : 0,
          group: cols[0] && cols[0].trim() !== "" ? cols[0].trim() : "",
          lastName: cols[1] !== null ? cols[1] : "",
          firstName: cols[2] !== null ? cols[2] : "",
          rating: cols[3] ? parseInt(String(cols[3]).trim() || "-1") : -1,
          nRating: 0,
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
        localStorage.clear();

        if (sortBy === "rank") {
          loadedPlayers.sort((a, b) => a.rank - b.rank);
        } else if (sortBy === "nRating") {
          loadedPlayers.sort((a, b) => {
            const ratingA = a.nRating || 0;
            const ratingB = b.nRating || 0;
            if (ratingA !== ratingB) {
              return ratingB - ratingA;
            }
            return a.rank - b.rank;
          });
        } else if (sortBy === "rating") {
          loadedPlayers.sort((a, b) => {
            const ratingA = a.rating || 0;
            const ratingB = b.rating || 0;
            if (ratingA !== ratingB) {
              return ratingB - ratingA;
            }
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

        localStorage.setItem(
          getKeyPrefix() + "ladder_players",
          JSON.stringify(loadedPlayers),
        );
        setPlayers(loadedPlayers);

        setSortBy(null);
      } else {
      }
    };

    reader.readAsText(fileToLoad);
  };

  const checkGameErrors = (): {
    hasErrors: boolean;
    matches: MatchData[];
    errors: ValidationResult[];
    errorCount: number;
    playerResultsByMatch?: Map<string, any[]>;
  } => {
    if (players.length === 0) {
      console.error("No players to process");
      return { hasErrors: false, matches: [], errors: [], errorCount: 0 };
    }

    const { matches, hasErrors, errorCount, errors, playerResultsByMatch } =
      processGameResults(players, 31);
    if (shouldLog(4)) {
      console.log(`Validated ${matches.length} matches, errors: ${errorCount}`);
    }

    if (hasErrors && errors.length > 0) {
      console.warn("Errors detected. Opening dialog for correction.");
      setIsRecalculating(true);
      setPendingPlayers(players);
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

    return { hasErrors, matches, errors, errorCount, playerResultsByMatch };
  };

  const recalculateRatings = async () => {
    if (shouldLog(10)) {
      console.log(
        `>>> [BUTTON PRESSED] Recalculate Ratings - ${players.length} players`,
      );
    }

    // Start batch mode - defer server sync until all operations complete
    startBatch();

    // Always build fresh matches from current UI state (no caching)
    const result = checkGameErrors();

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
      // Count existing game results before clear
      let totalExisting = 0;
      for (const p of players) {
        const filled = p.gameResults.filter((r) => r !== null && r !== "");
        totalExisting += filled.length;
      }
      console.log(`Total existing game results: ${totalExisting}`);
    }

    const processedPlayers = repopulateGameResults(
      players,
      matches,
      31,
      playerResultsByMatch,
    );

    if (shouldLog(5)) {
      // Count results after repopulation
      let totalAfterRepop = 0;
      for (const p of processedPlayers) {
        const filled = p.gameResults.filter((r) => r !== null && r !== "");
        totalAfterRepop += filled.length;
      }
      console.log(`Total results after repopulation: ${totalAfterRepop}`);
    }

    const calculatedPlayers = calculateRatings(processedPlayers, matches);

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

        // Apply New Day transformations to calculatedPlayers
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
    if (shouldLog(10)) {
      console.log("Rating calculation complete\n");
    }

    // End batch mode - triggers single server sync with all accumulated changes
    await endBatch();
  };

  useEffect(() => {
    if (onSetRecalculateRef) {
      onSetRecalculateRef(recalculateRatings);
    }
  }, [onSetRecalculateRef, recalculateRatings]);

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

  const handleCorrectionSubmit = (correctedString: string) => {
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
    let calculatedPlayers = calculateRatings(processedPlayers, pendingMatches);

    // Check for pending New Day operation
    const pendingNewDayJson = localStorage.getItem("ladder_pending_newday");
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

        // Apply New Day transformations
        const finalPlayers = processNewDayTransformations(
          calculatedPlayers,
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
    savePlayers(updatedPlayers).catch((err) => {
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
        const ratingA = a.nRating || 0;
        const ratingB = b.nRating || 0;
        if (ratingA !== ratingB) {
          return ratingB - ratingA;
        }
        return a.rank - b.rank;
      } else if (sortMethod === "rating") {
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        if (ratingA !== ratingB) {
          return ratingB - ratingA;
        }
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
  const saveLocalStorage = async () => {
    if (players.length === 0) return;
    try {
      // Save players
      await savePlayers(players);

      // Save project name
      if (projectName) {
        setProjectNameStorage(projectName);
      }

      // Save zoom level
      const zoomPercent = parseInt(zoomLevel);
      setZoomLevelStorage(zoomPercent);

      // Save settings from state if Settings component is open
      const savedSettings = getSettings();
      if (savedSettings) {
        try {
          // Ensure settings are properly saved
          const updatedSettings = {
            ...savedSettings,
            kFactor: Math.max(1, Math.min(100, savedSettings.kFactor || 20)),
            debugLevel: Math.max(
              0,
              Math.min(20, savedSettings.debugLevel || 5),
            ),
          };
          saveSettings(updatedSettings);
        } catch (err) {
          console.error("Failed to parse settings:", err);
        }
      }

      console.log(
        ">>> [SAVE] Saved players, project name, zoom level, and settings to storage",
      );
    } catch (err) {
      console.error("Failed to save to storage:", err);
    }
  };

  const handleFileAction = (action: "load" | "save" | "export") => {
    if (shouldLog(10)) {
      console.log(`>>> [MENU ACTION] ${action}`);
    }
    switch (action) {
      case "load":
        fileInputRef.current?.click();
        break;
      case "save":
        saveLocalStorage();
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

    setPlayers((prevPlayers) => {
      const updatedPlayers = prevPlayers.map((p) => ({ ...p }));

      for (const result of results) {
        const playerIndex = updatedPlayers.findIndex(
          (p) => p.rank === result.playerRank,
        );
        if (playerIndex !== -1) {
          const player = updatedPlayers[playerIndex];
          if (!player.gameResults) {
            player.gameResults = new Array(31).fill(null);
          }
          player.gameResults[result.roundIndex] = result.resultString;
        }
      }

      return updatedPlayers;
    });

    // Save after state update
    const updatedPlayers = players.map((p) => ({ ...p }));
    for (const result of results) {
      const playerIndex = updatedPlayers.findIndex((p) => p.rank === result.playerRank);
      if (playerIndex !== -1) {
        if (!updatedPlayers[playerIndex].gameResults) {
          updatedPlayers[playerIndex].gameResults = new Array(31).fill(null);
        }
        updatedPlayers[playerIndex].gameResults[result.roundIndex] = result.resultString;
      }
    }
    await savePlayers(updatedPlayers);

    if (shouldLog(10)) {
      console.log(`>>> [BULK PASTE] Successfully applied ${results.length} entries`);
    }
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
    setPlayers((prevPlayers) => {
      const maxRank = prevPlayers.reduce(
        (max, p) => Math.max(max, p.rank || 0),
        0,
      );
      const newRank = maxRank + 1;

      const newPlayer: PlayerData = {
        ...playerData,
        rank: newRank,
        nRating: playerData.rating || 0,
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

  const handleSave = async () => {
    console.log("[SAVE] Saving to server...");
    const result = await saveToServer();
    if (result.success) {
      alert("✓ Saved successfully!");
    } else {
      alert(`✗ Save failed: ${result.error}`);
    }
  };

  const handleToggleAdmin = () => {
    if (shouldLog(10)) {
      console.log(">>> [MENU ACTION] Toggle admin mode");
    }
    setIsAdmin(!isAdmin);
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
    const titlePart = projectName.split(" ")[0];
    const filename = `${titlePart}_${timestamp}.tab`;

    const headerLine =
      "Group\tLast Name\tFirst Name\tRating\tRnk\tN Rate\tGr\tGms\tPhone\tInfo\tSchool\tRoom\t1\t2\t3\t4\t5\t6\t7\t8\t9\t10\t11\t12\t13\t14\t15\t16\t17\t18\t19\t20\t21\t22\t23\t24\t25\t26\t27\t28\t29\t30\t31\Version 1.21";

    let output = headerLine + "\n";

    players.forEach((player) => {
      const gameResults = player.gameResults || new Array(31).fill(null);

      output += `${player.group || ""}\t${player.lastName || ""}\t${player.firstName || ""}\t${player.rating || ""}\t${player.rank}\t${player.nRating || ""}\t${player.grade || ""}\t${player.num_games || 0}\t${player.attendance || ""}\t${player.phone || ""}\t${player.info || ""}\t${player.school || ""}\t${player.room || ""}`;

      output += gameResults.map((r) => r || "").join("\t");
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

  if (!players || players.length === 0) {
    return (
      <div style={{ padding: "2rem", color: "#64748b" }}>
        <h1>{projectName}</h1>
        <p>Loading sample data...</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "1rem" }}>
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
        isAdmin={isAdmin}
        projectName={projectName}
        onSetTitle={(newTitle) => {
          setProjectName(newTitle);
          setProjectNameStorage(newTitle);
        }}
      />

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
          onSave={handleSave}
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

      <div
        style={{
          overflow: "auto",
          border: "1px solid #cbd5e1",
          borderRadius: "0.5rem",
        }}
      >
        <table
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
                    }}
                  >
                    Attendance
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
                    }}
                  >
                    Info
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
                    }}
                  >
                    School
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
                    }}
                  >
                    Room
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
            {players.map((player, rowIndex) => {
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
                  {Object.keys(player)
                    .filter((_, i) => i < (isAdmin ? 13 : 6))
                    .map((field, col) => {
                      const isEditable = isAdmin && field !== "rank";
                      return (
                        <td
                          key={`${rowIndex}-${col}`}
                          contentEditable={isEditable}
                          suppressContentEditableWarning={true}
                          onBlur={(e) => {
                            if (isEditable && e.target.textContent) {
                              const value = e.target.textContent;
                              setPlayers((prevPlayers) => {
                                const updatedPlayers = [...prevPlayers];
                                const targetPlayer = updatedPlayers.find(
                                  (p) => p.rank === player.rank,
                                );
                                if (targetPlayer) {
                                  switch (field) {
                                    case "group":
                                      targetPlayer.group = value;
                                      break;
                                    case "lastName":
                                      targetPlayer.lastName = value;
                                      break;
                                    case "firstName":
                                      targetPlayer.firstName = value;
                                      break;
                                    case "rating":
                                      targetPlayer.rating =
                                        parseInt(value) || 0;
                                      break;
                                    case "nRating":
                                      targetPlayer.nRating =
                                        parseInt(value) || 0;
                                      break;
                                    case "grade":
                                      targetPlayer.grade = value;
                                      break;
                                    case "num_games":
                                      targetPlayer.num_games =
                                        parseInt(value) || 0;
                                      break;
                                    case "attendance":
                                      targetPlayer.attendance = value;
                                      break;
                                    case "phone":
                                      targetPlayer.phone = value;
                                      break;
                                    case "info":
                                      targetPlayer.info = value;
                                      break;
                                    case "school":
                                      targetPlayer.school = value;
                                      break;
                                    case "room":
                                      targetPlayer.room = value;
                                      break;
                                  }
                                }
                                return updatedPlayers;
                              });
                              savePlayers(
                                players.map((p) =>
                                  p.rank === player.rank
                                    ? ({
                                        ...p,
                                        [field]:
                                          field === "rating" ||
                                          field === "nRating" ||
                                          field === "games"
                                            ? parseInt(e.target.textContent)
                                            : e.target.textContent,
                                      } as any)
                                    : p,
                                )
                              ).catch((err) => {
                                console.error("Failed to save cell edit:", err);
                              });
                            }
                          }}
                          style={{
                            padding: "0.5rem 0.75rem",
                            borderBottom: "1px solid #e2e8f0",
                            verticalAlign: "middle",
                            borderRight: "1px solid #e2e8f0",
                            backgroundColor:
                              rowIndex % 2 >= 1 ? "#f8fafc" : "transparent",
                          }}
                        >
                          {field === "rank" && player.rank}
                          {field === "group" && player.group}
                          {field === "lastName" && player.lastName}
                          {field === "firstName" && player.firstName}
                          {field === "rating" && player.rating !== undefined
                            ? player.rating
                            : ""}
                          {field === "nRating" && player.nRating !== undefined
                            ? player.nRating
                            : ""}
                          {field === "grade" && player.grade}
                          {field === "num_games" && player.num_games}
                          {field === "attendance" && player.attendance}
                          {field === "phone" && player.phone}
                          {field === "info" && player.info}
                          {field === "school" && player.school}
                          {field === "room" && player.room}
                        </td>
                      );
                    })}
                  {gameResults.map((result, gCol) => {
                    const isEditable = isAdmin;
                    return (
                      <td
                        key={`game-${player.rank}-${gCol}`}
                        contentEditable={isEditable}
                        suppressContentEditableWarning={true}
                        onClick={() => {
                          if (!isAdmin) {
                            setEntryCell({
                              playerRank: player.rank,
                              round: gCol,
                            });
                          }
                        }}
                        onBlur={(e) => {
                          if (isEditable && e.target.textContent) {
                            const value = e.target.textContent;
                            setPlayers((prevPlayers) => {
                              const targetPlayer = prevPlayers.find(
                                (p) => p.rank === player.rank,
                              );
                              if (!targetPlayer) return prevPlayers;

                              const newGameResults = [
                                ...targetPlayer.gameResults,
                              ];
                              newGameResults[gCol] = value;

                              return prevPlayers.map((p) =>
                                p.rank === player.rank
                                  ? { ...p, gameResults: newGameResults }
                                  : p,
                              );
                            });
                          }
                        }}
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
                        {result ? result : ""}
                        {tempGameResult &&
                        tempGameResult.playerRank === player.rank &&
                        tempGameResult.round === gCol
                          ? tempGameResult.resultString
                          : ""}
                      </td>
                    );
                  })}
                  {Array.from({
                    length: Math.max(0, 20 - gameResults.length),
                  }).map((_, emptyCol) => (
                    <td
                      key={`empty-${player.rank}-${emptyCol}`}
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
        />
      )}
      {entryCell &&
        !isRecalculating &&
        !isWalkthrough &&
        walkthroughErrors.length === 0 && (
          <ErrorDialog
            error={null}
            players={players}
            mode="game-entry"
            entryCell={entryCell}
            existingValue={
              players.find((p) => p.rank === entryCell.playerRank)
                ?.gameResults?.[entryCell.round] || undefined
            }
            onClose={() => {
              setEntryCell(null);
              setTempGameResult(null);
            }}
            onSubmit={handleGameEntrySubmit}
            onClearCell={clearCurrentCell}
            onUpdatePlayerData={handleUpdatePlayerData}
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
    </div>
  );
}
