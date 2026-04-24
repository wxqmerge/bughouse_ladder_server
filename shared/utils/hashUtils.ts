/**
 * VB6 Bughouse Ladder - Shared Logic
 */

import { 
  PlayerData, 
  ValidationResult, 
  MatchData, 
  PlayerMatchResult,
  ProcessResult,
  UpdatePlayerGameDataResult,
  ValidationResultResult
} from "../types";
import { 
  CalculateRatingsDebugTrace, 
  MatchDebugTrace, 
  PlayerDebugUpdate,
  DebugLogger 
} from "./debugUtils";

// Local debug function for shared module (no localStorage dependency)
function shouldLog(_threshold: number): boolean {
  return false; // Disabled in shared module by default
}

/**
 * VB6 Line: 25 - Global constants from common.bas
 * Field indices used throughout the VB6 application
 */
export const CONSTANTS = {
  GROWS_MAX: 200,
  GCOLS: 44,
  GROUP_FIELD: 0,
  LAST_NAME_FIELD: 1,
  FIRST_NAME_FIELD: 2,
  RATING_FIELD: 3,
  RANKING_FIELD: 4,
  N_RATING_FIELD: 5,
  GRADE_FIELD: 6,
  GAMES_FIELD: 7,
  ATTENDANCE_FIELD: 8,
  PHONE_FIELD: 9,
  INFO_FIELD: 10,
  SCHOOL_FIELD: 11,
  ROOM_FIELD: 12,
  LAST_PARAM_FIELD: 12,
} as const;

/**
 * VB6 Line: 90 - Result string parsing symbols
 * Used for parsing game results from strings
 */
export const RESULT_STRING = "OLDWXYZ__________" as const;

/**
 * VB6 Line: 61 - Group codes for player classification
 */
export const GROUP_CODES = "A1xAxBxCxDxExFxGxHxIxZx   " as const;

/**
 * VB6 Line: 77 - Sort options
 */
export const SORT_OPTIONS = {
  SORT_RANK: 0,
  SORT_NAME: 1,
  SORT_FIRST_NAME: 2,
  SORT_RATING: 3,
} as const;

/**
 * VB6 Line: 129-130 - Elo rating formula
 * Returns probability of winning for given ratings
 */
export function formula(myRating: number, opponentsRating: number): number {
  return (
    1 / (1 + 10 ** ((Math.abs(opponentsRating) - Math.abs(myRating)) / 400))
  );
}

/**
 * VB6 Line: 133-137 - Get ladder name from current directory
 * Note: This uses window.location, which is not available in Node.js.
 * For the server, this should be handled differently or passed in.
 */
export function getLadderName(): string {
  if (typeof window !== "undefined") {
    const currentPath = window.location.pathname;
    const lastSlashIndex = currentPath.lastIndexOf("/");
    return currentPath.substring(lastSlashIndex + 1);
  }
  return "";
}

/**
 * VB6 Line: 138-154 - Player array to string conversion
 * Translates player and score arrays to hash string format
 */
export function entry2string(
  playersList: number[],
  scoreList: number[],
): string {
  // VB6 Line: 140-145 - Swap to ensure correct order
  if (playersList[0] > playersList[1]) {
    const temp = playersList[0];
    playersList[0] = playersList[1];
    playersList[1] = temp;
  }
  if (playersList[3] > playersList[4]) {
    const temp = playersList[3];
    playersList[3] = playersList[4];
    playersList[4] = temp;
  }

  const resultParts: string[] = [
    playersList[0].toString(),
    ":",
    playersList[1].toString(),
    RESULT_STRING.charAt(scoreList[0]),
  ];
  if (scoreList[1] > 0) {
    resultParts.push(RESULT_STRING.charAt(scoreList[1]));
  }
  resultParts.push(playersList[3].toString());
  resultParts.push(":");
  resultParts.push(playersList[4].toString());

  return resultParts.join("");
}

/**
 * VB6 Line: 155-271 - Parse entry string to structured data
 * Parses game entry like "23:29LW" into game details
 */
export function parseEntry(
  myText: string,
  playersList: number[],
  scoreList: number[],
): number {
  // VB6 Line: 167-171 - Reset arrays
  playersList[0] = 0;
  playersList[1] = 0;
  playersList[2] = 0;
  playersList[3] = 0;
  playersList[4] = 0;

  // Normalize input to uppercase
  const normalizedText = myText.toUpperCase();
  const strlen = normalizedText.length;
  if (strlen < 2) return -3;

  const results: string[] = [];
  let entry = 0;
  let numOrChar = 1; // 0 = number, 1 = char
  let entryString = "";
  let errorNum = 0;
  let resultIndex = 0; // Track which result slot (0 or 1)
  let hasColon = false; // Track if colon was used (indicates 4-player format)

  for (let i = 1; i <= strlen; i++) {
    const mychar = normalizedText.substring(i - 1, i);
    const myasc = mychar.charCodeAt(0);

    if (myasc > 33) {
      // VB6 Line: 180-183 - Handle underscore separator
      if (myasc === 95) {
        if (i === strlen) break;
        errorNum = 1;
        break;
      }

      // VB6 Line: 185-204 - Parse numbers and characters
      if (myasc >= 48 && myasc <= 57) {
        // Digit - accumulate in entryString
        numOrChar = 0;
      } else {
        // Non-digit character
        // Only store before colons, not before W/L/D
        if (myasc === 58) {
          // Colon separates pairs within same team
          hasColon = true;
          if (
            numOrChar === 0 &&
            playersList.length > entry &&
            entryString !== ""
          ) {
            playersList[entry] = parseInt(entryString);
            if (playersList[entry] > CONSTANTS.GROWS_MAX) {
              errorNum = 9;
              break;
            }
            entry++;
          }
          entryString = "";
          continue;
        } else if (mychar === "W" || mychar === "L" || mychar === "D") {
          // Score character - but first store the player number
          if (
            numOrChar === 0 &&
            playersList.length > entry &&
            entryString !== ""
          ) {
            playersList[entry] = parseInt(entryString);
            if (playersList[entry] > CONSTANTS.GROWS_MAX) {
              errorNum = 9;
              break;
            }
            entry++;
          }
          // Clear entryString since we stored the player
          entryString = "";
          // Store result character directly, don't add to entryString
          results[resultIndex] = mychar;
          resultIndex = resultIndex + 1;
          continue;
        } else {
          errorNum = 2;
        }
        numOrChar = 1;
      }

      entryString += mychar;
      if (numOrChar === 1) {
        // Store score character in result slot (for backward compatibility)
        results[resultIndex] = entryString;
        // Move to next result slot for next score
        resultIndex = resultIndex + 1;
        entryString = ""; // Reset entryString after storing result
      }
    }
  }

  // Store any remaining number at the end of the string
  if (numOrChar === 0 && playersList.length > entry && entryString !== "") {
    playersList[entry] = parseInt(entryString);
    entry++;
    if (playersList[entry - 1] > CONSTANTS.GROWS_MAX) {
      errorNum = 9;
    }
  }

  // VB6 Line: 215-220 - Validate game format
  // Must have at least 2 players and at least 1 result
  if (entry < 2) {
    errorNum = 3; // Incomplete entry - need at least 2 players
  } else if (resultIndex === 0) {
    errorNum = 3; // Incomplete entry - need at least 1 result
  } else if (hasColon && entry < 4) {
    // If colon used, must be 4-player format with all 4 players
    errorNum = 7; // Missing player 4
  } else if (entry === 2 && resultIndex > 2) {
    // For 2-player games, allow up to 2 results
    errorNum = 5; // too many results
  } else if (entry === 4 && resultIndex < 1) {
    // For 4-player games, must have at least 1 result
    errorNum = 3; // Incomplete entry
  } else if (entry === 4 && resultIndex > 2) {
    // For 4-player games, allow up to 2 results
    errorNum = 5; // too many results
  }

  // VB6 Line: 245-271 - Process scores
  // FIXED: RESULT_STRING.indexOf() returns the score directly (no -1 needed)
  // O=0, L=1, D=2, W=3, X=4, Y=5, Z=6
  scoreList[0] = RESULT_STRING.indexOf(results[0]);
  scoreList[1] = results[1] ? RESULT_STRING.indexOf(results[1]) : 0;

  // VB6 Line: 251-258 - Normalize player order
  // Store original values before normalization for display
  playersList[5] = playersList[0];
  playersList[6] = playersList[1];
  playersList[7] = playersList[2];
  playersList[8] = playersList[3];

  if (playersList[2] > 0) {
    // 4-player game
    if (playersList[0] > playersList[1]) {
      const temp = playersList[0];
      playersList[0] = playersList[1];
      playersList[1] = temp;
    }
    if (playersList[2] > playersList[3]) {
      const temp = playersList[2];
      playersList[2] = playersList[3];
      playersList[3] = temp;
    }

    // VB6 Line: 272-282 - Swap sides if necessary
    if (playersList[0] > playersList[2]) {
      const temp = playersList[0];
      playersList[0] = playersList[2];
      playersList[2] = temp;
      const temp2 = playersList[1];
      playersList[1] = playersList[3];
      playersList[3] = temp2;
      scoreList[0] = 4 - scoreList[0];
      if (scoreList[1] > 0) scoreList[1] = 4 - scoreList[1];
    }

    // VB6 Line: 284-292 - Create hash value
    const res = playersList[3];
    const computedRes =
      ((((res * 128 + playersList[2]) * 4 + scoreList[1]) * 4 + scoreList[0]) *
        128 +
        playersList[1]) *
      128 +
      playersList[0];

    // VB6 Line: 293-297 - Validate entry
    // Check for missing player 3 or 4
    if (playersList[3] > 0 && playersList[2] === 0) {
      errorNum = 7;
    }

    // VB6 Line: 299-316 - Handle duplicates
    // Check all pairs for duplicates
    if (
      playersList[0] === playersList[1] ||
      playersList[0] === playersList[2] ||
      playersList[0] === playersList[3] ||
      playersList[1] === playersList[2] ||
      playersList[1] === playersList[3] ||
      playersList[2] === playersList[3]
    ) {
      return -4;
    }

    // VB6 Line: 318-334 - Return result
    if (
      errorNum !== 0 ||
      playersList[0] === 0 ||
      playersList[1] === 0 ||
      playersList[2] === 0 ||
      scoreList[0] < 0 ||
      scoreList[1] < 0
    ) {
      return errorNum === 0 ? -3 : -errorNum;
    }

    return computedRes;
  } else {
    // 2-player game
    if (
      errorNum !== 0 ||
      playersList[0] === 0 ||
      playersList[1] === 0 ||
      scoreList[0] < 0
    ) {
      return errorNum === 0 ? -3 : -errorNum;
    }

    // Check for self-play in 2-player game
    if (playersList[0] === playersList[1]) {
      return -4;
    }

    const computedRes =
      ((playersList[0] * 128 + playersList[1]) * 4 + scoreList[0]) * 128 + 0;
    return computedRes;
  }
}

/**
 * VB6 Line: 372-378 - String to long conversion (wrapper for parseEntry)
 */
export function string2long(
  game: string,
  playersList: number[],
  scoreList: number[],
): number {
  return parseEntry(game, playersList, scoreList);
}

/**
 * VB6 Line: 384-409 - Long to string conversion
 * Converts hash value back to game string like "23:29LW"
 */
export function long2string(game: number): string {
  const resultParts: string[] = [];
  let tempGame = game;

  // VB6 Line: 411-421 - Extract structured data
  resultParts.push((tempGame % 128).toString());
  tempGame = Math.floor(tempGame / 128);
  resultParts.push(":");
  resultParts.push((tempGame % 128).toString());
  tempGame = Math.floor(tempGame / 128);
  resultParts.push(RESULT_STRING.charAt(tempGame % 4));
  tempGame = Math.floor(tempGame / 4);
  const nextChar = RESULT_STRING.charAt(tempGame % 4);
  if (nextChar !== "O") {
    resultParts.push(nextChar);
  }
  tempGame = Math.floor(tempGame / 4);
  resultParts.push((tempGame % 128).toString());
  tempGame = Math.floor(tempGame / 128);
  resultParts.push((tempGame % 128).toString());
  resultParts.push(":");
  resultParts.push((tempGame % 128).toString());

  // VB6 Line: 432-434 - Clean up empty parts
  const finalResult = resultParts.join("").replace(/ /g, "").replace(":0", "");
  return finalResult;
}

/**
 * VB6 Line: 414-416 - Reset placement tracking
 */
export function resetPlacement(): void {
  // This was global in VB6, now we'll manage it via state/context in the app
}

/**
 * VB6 Line: 419-422 - Hash function initialization
 * Sets up pseudorandom array for hash generation
 */
export function hashInitialize(): void {
  const rand8: number[] = Array.from({ length: 256 }, (_, i) => i);
  let k = 7;

  // VB6 Line: 452-461 - RC4-style key mixing
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 256; i++) {
      const s = rand8[i];
      k = (k + s) % 256;
      const temp = rand8[i];
      rand8[i] = rand8[k];
      rand8[k] = temp;
    }
  }

  // These were global in VB6, we'll handle them within the function scope or via a class/closure
}

export let hashArray: string[] = [];
export let hashIndex: number[] = [];

/**
 * Process game results from all players and calculate ratings
 * VB6-inspired implementation with hash table validation
 */
export function processGameResults(
  playersList: PlayerData[],
  numRounds: number = 31,
): ProcessResult {
  const results: MatchData[] = [];
  const errors: any[] = [];
  const parsedPlayersList = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const parsedScoreList = [0, 0];
  const matchResults = new Map<
    string,
    {
      result: string;
      playerRank: number;
      player1: number;
      player2: number;
      player3: number;
      player4: number;
      score1: number;
      score2: number;
      round: number;
    }[]
  >();
  const matchPlayerResults = new Map<
    string,
    {
      playerRank: number;
      resultString: string;
    }[]
  >();
  
  // Note: hashArray and hashIndex must be managed locally here to avoid global state issues
  let localHashArray: string[] = new Array(2048).fill("");
  let localHashIndex: number[] = new Array(2048).fill(0);

  // Helper to perform hash operations using local state
  const dataHashLocal = (
    skey: string,
    sval: string,
    hashMethod: number,
  ): string => {
    const b = new TextEncoder().encode(skey);
    let lKeyVal = b[0];

    for (let i = 1; i < b.length; i++) {
      if (b[i] >= 48 && b[i] <= 57) {
        lKeyVal = lKeyVal * 10 + (b[i] - 48);
      }
    }

    let i = lKeyVal % 2048;
    let found = false;
    let storedAtIdx = -1;

    while (!found) {
      if (lKeyVal === localHashIndex[i]) {
        if (hashMethod === 2) {
          localHashIndex[i] = 0;
          localHashArray[i] = "";
        }
        found = true;
      } else if (localHashIndex[i] === 0) {
        if (hashMethod === 0) {
          localHashIndex[i] = lKeyVal;
          localHashArray[i] = sval;
          storedAtIdx = i;
        }
        found = true;
      } else {
        i++;
        if (i === 2048) i = 0;
      }
    }

    return localHashArray[i];
  };

  const hashInitializeLocal = () => {
    const rand8: number[] = Array.from({ length: 256 }, (_, i) => i);
    let k = 7;
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 256; i++) {
        const s = rand8[i];
        k = (k + s) % 256;
        const temp = rand8[i];
        rand8[i] = rand8[k];
        rand8[k] = temp;
      }
    }
    localHashArray = new Array(2048).fill("");
    localHashIndex = new Array(2048).fill(0);
  };

  hashInitializeLocal();

  // Helper to convert score code between pairs (for perspective swapping)
  const swapScore = (code: number): number => {
    if (code === 0) return 0; // O stays O
    if (code === 1) return 3; // L becomes W
    if (code === 2) return 2; // D stays D
    if (code === 3) return 1; // W becomes L
    return 0;
  };

  // Helper to normalize a result string for comparison (converts to canonical form)
  const normalizeResultForComparison = (
    _result: string,
    _playerRank: number,
    parsedPlayers: number[],
    scores: number[],
  ): string => {
    const is4Player = parsedPlayers[2] > 0 && parsedPlayers[3] > 0;

    if (!is4Player) {
      // For 2-player games, normalize by sorting players
      const p1 = parsedPlayers[0];
      const p2 = parsedPlayers[1];
      const score = scores[0];

      // Convert score to letter (no perspective swap - score is already from first player's perspective)
      const scoreLetter =
        score === 0 ? "O" : score === 1 ? "L" : score === 2 ? "D" : "W";

      // Return in sorted player order (within team)
      const sortedTeam = [p1, p2].sort((a, b) => a - b);
      return `${sortedTeam[0]}${scoreLetter}${sortedTeam[1]}`;
    } else {
      // For 4-player team games: normalize each team separately, then sort teams by lowest player
      const team1 = [parsedPlayers[0], parsedPlayers[1]].sort((a, b) => a - b);
      const team2 = [parsedPlayers[2], parsedPlayers[3]].sort((a, b) => a - b);

      const minTeam1 = Math.min(team1[0], team1[1]);
      const minTeam2 = Math.min(team2[0], team2[1]);

      let normPair1: number[],
        normPair2: number[],
        normScore1: number,
        normScore2: number;

      if (minTeam1 < minTeam2) {
        // Team 1 comes first
        normPair1 = team1;
        normPair2 = team2;
        normScore1 = scores[0];
        normScore2 = scores[1];
      } else {
        // Team 2 comes first, swap perspectives
        normPair1 = team2;
        normPair2 = team1;
        normScore1 = swapScore(scores[1]);
        normScore2 = swapScore(scores[0]);
      }

      const score1Letter =
        normScore1 === 0
          ? "O"
          : normScore1 === 1
            ? "L"
            : normScore1 === 2
              ? "D"
              : "W";
      const score2Letter =
        normScore2 === 0
          ? "O"
          : normScore2 === 1
            ? "L"
            : normScore2 === 2
              ? "D"
              : "W";

      // Return with both pairs sorted internally and in correct order
      return `${normPair1[0]}:${normPair1[1]}${score1Letter}${score2Letter}${normPair2[0]}:${normPair2[1]}`;
    }
  };

  let errorCount = 0;

  // Global deduplication across all rounds to prevent same match appearing multiple times
  const processedMatches = new Set<string>();

  for (let round = 0; round < numRounds; round++) {
    const processedPairs = new Set<string>(); // Use string keys for normalized deduplication within round

    for (let i = 0; i < playersList.length; i++) {
      const player = playersList[i];
      const result = player.gameResults?.[round] || null;

      if (!result || result.trim() === "") continue;

      // Reset parsed arrays for each result
      parsedPlayersList[0] = 0;
      parsedPlayersList[1] = 0;
      parsedPlayersList[3] = 0;
      parsedPlayersList[4] = 0;
      parsedScoreList[0] = 0;
      parsedScoreList[1] = 0;

      const hashValue = string2long(result, parsedPlayersList, parsedScoreList);

      if (hashValue < 0) {
        errorCount++;
        errors.push({
          hashValue,
          player1: parsedPlayersList[0],
          player2: parsedPlayersList[1],
          player3: parsedPlayersList[2], // BUG FIX: was [3]
          player4: parsedPlayersList[3], // BUG FIX: was [4]
          score1: parsedScoreList[0],
          score2: parsedScoreList[1],
          resultIndex: round,
          isValid: false,
          error: -hashValue,
          playerRank: player.rank,
          originalString: result,
        });
        continue;
      }

      const player1Rank = parsedPlayersList[0];
      const player2Rank = parsedPlayersList[1];
      const player3Rank = parsedPlayersList[2];
      const player4Rank = parsedPlayersList[3];
      const player1Score = parsedScoreList[0];
      const player2Score = parsedScoreList[1];

      // Create normalized key for deduplication (sorted players)
      let normKey: string;
      if (player3Rank > 0 && player4Rank > 0) {
        const sortedPlayers = [
          player1Rank,
          player2Rank,
          player3Rank,
          player4Rank,
        ].sort((a, b) => a - b);
        normKey = `${sortedPlayers[0]}-${sortedPlayers[1]}-${sortedPlayers[2]}-${sortedPlayers[3]}`;
      } else {
        const sortedPair = [player1Rank, player2Rank].sort((a, b) => a - b);
        normKey = `${sortedPair[0]}-${sortedPair[1]}`;
      }

      if (processedPairs.has(normKey)) {
        continue;
      }

      if (player1Rank <= 0 || player2Rank <= 0) {
        errorCount++;
        continue;
      }

      if (player1Rank === player2Rank) {
        errorCount++;
        errors.push({
          hashValue: 0,
          player1: parsedPlayersList[0],
          player2: parsedPlayersList[1],
          player3: parsedPlayersList[2],
          player4: parsedPlayersList[3],
          score1: parsedScoreList[0],
          score2: parsedScoreList[1],
          resultIndex: round,
          isValid: false,
          error: 3, // Incomplete entry
          originalString: result,
          playerRank: player.rank,
        });
        continue;
      }

      if (player1Rank > 200 || player2Rank > 200) {
        errorCount++;
        continue;
      }

      const player1 = playersList[player1Rank - 1];
      const player2 = playersList[player2Rank - 1];

      if (!player1 || !player2) {
        errorCount++;
        continue;
      }

      // Include all players in key to distinguish 2-player vs 4-player games
      // Normalize by sorting player ranks so same game has same key regardless of who entered it
      const is4Player = parsedPlayersList[2] > 0 && parsedPlayersList[3] > 0;
      let key: string;
      if (is4Player) {
        const sortedPlayers = [
          parsedPlayersList[0],
          parsedPlayersList[1],
          parsedPlayersList[2],
          parsedPlayersList[3],
        ].sort((a, b) => a - b);
        key = `${sortedPlayers[0]}-${sortedPlayers[1]}-${sortedPlayers[2]}-${sortedPlayers[3]}`;
      } else {
        const sortedPair = [player1Rank, player2Rank].sort((a, b) => a - b);
        key = `${sortedPair[0]}-${sortedPair[1]}`;
      }

      if (!matchResults.has(key)) {
        matchResults.set(key, []);
      }
      matchResults.get(key)!.push({
        result,
        playerRank: player.rank,
        player1: parsedPlayersList[0],
        player2: parsedPlayersList[1],
        player3: parsedPlayersList[2], // BUG FIX: was [3]
        player4: parsedPlayersList[3], // BUG FIX: was [4]
        score1: parsedScoreList[0],
        score2: parsedScoreList[1],
        round,
      });

      // Store original result string for each player
      if (!matchPlayerResults.has(key)) {
        matchPlayerResults.set(key, []);
      }
      matchPlayerResults.get(key)!.push({
        playerRank: player.rank,
        resultString: result,
      });

      // Use normalized key for deduplication to catch different orderings
      processedPairs.add(normKey);

      const _matchKey = `${hashValue}_${round}`;
      dataHashLocal(_matchKey, result, 0);

      // Check if this match is already in results (global deduplication)
      if (processedMatches.has(normKey)) {
        continue;
      }
      processedMatches.add(normKey);

      results.push({
        player1: parsedPlayersList[0],
        player2: parsedPlayersList[1],
        player3: parsedPlayersList[2], // BUG FIX: was [3]
        player4: parsedPlayersList[3], // BUG FIX: was [4]
        score1: player1Score,
        score2: player2Score,
        side0Won: player1Score === 3,
      });
    }
  }

  // Process match results and check for conflicts
  for (const [_, entries] of matchResults.entries()) {
    if (entries.length < 2) continue;

    // Normalize all results to the same perspective for comparison
    const normalizedEntries = entries.map((e) => {
      const parsedPlayers = [e.player1, e.player2, e.player3, e.player4];
      const scores = [e.score1, e.score2];
      return normalizeResultForComparison(
        e.result,
        e.playerRank,
        parsedPlayers,
        scores,
      );
    });

    const allSame = normalizedEntries.every(
      (n, i) => i === 0 || n === normalizedEntries[0],
    );
    if (!allSame) {
      // Collect all conflicting results for this match
      const conflicts = entries.map((e) => ({
        playerRank: e.playerRank,
        result: e.result,
        round: e.round,
      }));

      // Only create one error for the conflict (use first entry as primary)
      errorCount++;
      const primaryEntry = entries[0];
      const conflictDetails = conflicts.map((c) => ({
        playerRank: c.playerRank,
        result: c.result,
      }));

      errors.push({
        hashValue: 0,
        player1: primaryEntry.player1,
        player2: primaryEntry.player2,
        player3: primaryEntry.player3,
        player4: primaryEntry.player4,
        score1: primaryEntry.score1,
        score2: primaryEntry.score2,
        resultIndex: primaryEntry.round,
        isValid: false,
        error: 10,
        originalString: primaryEntry.result,
        playerRank: primaryEntry.playerRank,
        conflictingResults: conflictDetails,
      });
    }
  }

  return {
    matches: results,
    playerResultsByMatch: matchPlayerResults,
    hasErrors: errorCount > 0,
    errorCount: errorCount,
    errors,
  };
}

/**
 * Calculate Elo ratings based on game results
 * VB6-matching implementation with inline blending and correct performance formula.
 */
/**
 * Result of calculateRatings — includes players and optional debug trace.
 */
export interface CalculateRatingsResult {
  /** Updated player list */
  players: PlayerData[];
  /** Debug trace (only present when debugMode is true) */
  trace?: CalculateRatingsDebugTrace;
  /** Per-pass nRating results (double-pass averaging) */
  pass1NRating?: Map<number, number>;
  pass2NRating?: Map<number, number>;
}

/**
 * Internal single-pass calculation.
 * Returns the updated players copy and the currentRating map.
 */
function calculateRatingsSinglePass(
  playersList: PlayerData[],
  matches: MatchData[],
  EloKfactor: number,
  debugMode: boolean,
  passLabel?: string,
): { players: PlayerData[]; currentRating: Map<number, number>; playedToday: Set<number>; matchTraces: MatchDebugTrace[] } {
  const dbg = new DebugLogger(debugMode);
  const playersCopy = playersList.map((p) => ({ ...p }));

  // Default trophyEligible to true for backward compatibility with old data
  for (const p of playersCopy) {
    if (p.trophyEligible === undefined) {
      p.trophyEligible = true;
    }
  }

  // VB6 ladder.frm lines 1426-1449: initialize arrays
  const careerGames = new Map<number, number>();
  const currentRating = new Map<number, number>();
  const playedToday = new Set<number>();

  const label = passLabel ?? "";
  dbg.group(`${label}[INIT] VB6 lines 1422-1449 — k_val = ${EloKfactor}`, () => {
    for (const p of playersCopy) {
      careerGames.set(p.rank, p.num_games);
      let initRating: number;
      if (p.num_games === 0) {
        initRating = p.nRating > 0 ? p.nRating : p.rating;
        if (initRating > 1800) initRating = 1800;
      } else {
        initRating = p.rating;
      }
      const nrating = Math.abs(initRating);
      currentRating.set(p.rank, nrating);

      dbg.log(
        `P${p.rank}: num_games=${p.num_games}, rating=${p.rating}, nRating=${p.nRating} → nrating=${nrating}`,
      );
    }
  });

  // Process each match inline (VB6: match processing loop)
  const matchTraces: MatchDebugTrace[] = [];
  for (const match of matches) {
    const p1 = playersCopy.find((p) => p.rank === match.player1);
    const p2 = playersCopy.find((p) => p.rank === match.player2);
    if (!p1 || !p2) continue;

    const p3Rank = match.player3;
    const p4Rank = match.player4;
    const is4Player = p3Rank > 0 && p4Rank > 0;

    const scores: number[] = [match.score1, is4Player ? match.score2 : 0];
    const matchTrace: MatchDebugTrace = {
      match: `${match.player1}:${match.player2}${is4Player ? match.score1 + "" + match.score2 : match.score1}${match.player3 > 0 ? ":" + match.player3 + match.player4 : ""}`,
      players: [match.player1, match.player2, 0, match.player3, match.player4],
      scores,
      sideRatings: [0, 0],
      expected: 0,
      wldPerfs: [0, 0],
      perfRatings: [0, 0],
      eloPerfs: [0, 0],
      playerUpdates: [],
    };

    dbg.group(
      `${label}[MATCH] VB6 lines 1474-1535 — ${is4Player ? "4-player" : "2-player"}`,
      () => {
        let side0 = currentRating.get(p1.rank)!;
        let side1 = currentRating.get(p2.rank)!;
        if (is4Player) {
          const p3 = playersCopy.find((p) => p.rank === p3Rank);
          const p4 = playersCopy.find((p) => p.rank === p4Rank);
          if (p3 && p4) {
            side0 = (currentRating.get(p1.rank)! + currentRating.get(p2.rank)!) / 2;
            side1 = (currentRating.get(p3.rank)! + currentRating.get(p4.rank)!) / 2;
          }
        }

       dbg.log(`sides(0)=${side0.toFixed(1)}, sides(1)=${side1.toFixed(1)}`);
        matchTrace.sideRatings = [side0, side1];

        // VB6 ladder.frm line 1486: perf = formula(sides(0), sides(1))
        const expected = formula(side0, side1);
        matchTrace.expected = expected;
        dbg.log(`expected = formula(${side0}, ${side1}) = ${expected.toFixed(6)}`);

        // VB6 lines 1489-1501: accumulate perfs from each game score
        let wldPerfs0 = 0;
        let wldPerfs1 = 0;
        const scoresList = is4Player ? [match.score1, match.score2] : [match.score1];
        for (const sc of scoresList) {
          if (sc === 3) { wldPerfs0 += 0.5; wldPerfs1 -= 0.5; }
          else if (sc === 1) { wldPerfs0 -= 0.5; wldPerfs1 += 0.5; }
        }

        dbg.log(
          `FIRST LOOP (W/L/D): perfs=(${wldPerfs0.toFixed(2)}, ${wldPerfs1.toFixed(2)})`,
        );
        matchTrace.wldPerfs = [wldPerfs0, wldPerfs1];

        // Self-based perfRating: ownRating + multiplier * wldPerfs
        // 4p: multiplier=400 (VB6 ×2/÷2 trick), per-player (not per-side)
        // 2p: multiplier=800, ownRating = sideRating (same as per-side)
        const perfMultiplier = is4Player ? 400 : 800;
        const side0PerfRating = side0 + perfMultiplier * wldPerfs0;
        const side1PerfRating = side1 + perfMultiplier * wldPerfs1;
        matchTrace.perfRatings = [
          Math.max(0, side0PerfRating),
          Math.max(0, side1PerfRating),
        ];

        dbg.log(
          `PERF RATING (side-level, for 2p/trace): sides=(${matchTrace.perfRatings[0].toFixed(1)}, ${matchTrace.perfRatings[1].toFixed(1)})`,
        );

        // VB6 lines 1514-1519: expected adjustment runs once per game (myplayer loop)
        // 2p: 1 game → 1x, 4p: 2 games → 2x
        let eloPerfs0: number;
        let eloPerfs1: number;
        const expectedMult = is4Player ? 2 : 1;
        eloPerfs0 = wldPerfs0 + expectedMult * (0.5 - expected);
        eloPerfs1 = wldPerfs1 + expectedMult * (expected - 0.5);
        matchTrace.eloPerfs = [eloPerfs0, eloPerfs1];

        dbg.log(
          `SECOND LOOP (expected diff): eloPerfs=(${eloPerfs0.toFixed(4)}, ${eloPerfs1.toFixed(4)})`,
        );

        const side0Players = is4Player
          ? [p1, p2].filter(Boolean)
          : [p1];
        const side1Players = is4Player
          ? [p3Rank > 0 && p4Rank > 0
            ? playersCopy.find((p) => p.rank === p3Rank)
            : null,
            p3Rank > 0 && p4Rank > 0
            ? playersCopy.find((p) => p.rank === p4Rank)
            : null,
          ].filter(Boolean) as PlayerData[]
          : [p2];

        for (const player of side0Players) {
          const games = careerGames.get(player.rank)!;
          const nratingBefore = currentRating.get(player.rank)!;
          playedToday.add(player.rank);

          // Self-based perfRating: ownRating + multiplier * wldPerfs
          // For 2p: ownRating = side0, so same as side0PerfRating
          // For 4p: uses player's individual rating, not side average
          const playerPerfRating = Math.max(0, nratingBefore + perfMultiplier * wldPerfs0);

          const update: PlayerDebugUpdate = {
            rank: player.rank,
            mySide: 0,
            numGamesBefore: games,
            nRatingBefore: nratingBefore,
            formula: games > 9 ? "elo" : "blend",
            nRatingAfterRaw: 0,
            nRatingAfter: 0,
            numGamesAfter: games + 1,
          };

          if (games > 9) {
            update.formula = "elo";
            update.kFactor = EloKfactor;
            const raw = nratingBefore + eloPerfs0 * EloKfactor;
            update.nRatingAfterRaw = raw;
            update.nRatingAfter = Math.abs(raw);
            currentRating.set(player.rank, Math.abs(raw));
            dbg.log(
              `  P${player.rank} [side 0, ${games} games]: ELO → ${nratingBefore.toFixed(1)} + ${eloPerfs0.toFixed(4)} × ${EloKfactor} = ${raw.toFixed(1)} → abs = ${Math.abs(raw).toFixed(1)}`,
            );
          } else {
            update.formula = "blend";
            update.opposingPerfRating = playerPerfRating;
            const blended = (nratingBefore * games + playerPerfRating) / (games + 1);
            update.nRatingAfterRaw = blended;
            update.nRatingAfter = Math.abs(blended);
            currentRating.set(player.rank, Math.abs(blended));
            dbg.log(
              `  P${player.rank} [side 0, ${games} games]: BLEND → (${nratingBefore.toFixed(1)} × ${games} + ${playerPerfRating.toFixed(1)}) / ${games + 1} = ${blended.toFixed(1)} → abs = ${Math.abs(blended).toFixed(1)}`,
            );
          }

          matchTrace.playerUpdates.push(update);
          careerGames.set(player.rank, games + 1);
        }

        for (const player of side1Players) {
          const games = careerGames.get(player.rank)!;
          const nratingBefore = currentRating.get(player.rank)!;
          playedToday.add(player.rank);

          // Self-based perfRating: ownRating + multiplier * wldPerfs
          const playerPerfRating = Math.max(0, nratingBefore + perfMultiplier * wldPerfs1);

          const update: PlayerDebugUpdate = {
            rank: player.rank,
            mySide: 1,
            numGamesBefore: games,
            nRatingBefore: nratingBefore,
            formula: games > 9 ? "elo" : "blend",
            nRatingAfterRaw: 0,
            nRatingAfter: 0,
            numGamesAfter: games + 1,
          };

          if (games > 9) {
            update.formula = "elo";
            update.kFactor = EloKfactor;
            const raw = nratingBefore + eloPerfs1 * EloKfactor;
            update.nRatingAfterRaw = raw;
            update.nRatingAfter = Math.abs(raw);
            currentRating.set(player.rank, Math.abs(raw));
            dbg.log(
              `  P${player.rank} [side 1, ${games} games]: ELO → ${nratingBefore.toFixed(1)} + ${eloPerfs1.toFixed(4)} × ${EloKfactor} = ${raw.toFixed(1)} → abs = ${Math.abs(raw).toFixed(1)}`,
            );
          } else {
            update.formula = "blend";
            update.opposingPerfRating = playerPerfRating;
            const blended = (nratingBefore * games + playerPerfRating) / (games + 1);
            update.nRatingAfterRaw = blended;
            update.nRatingAfter = Math.abs(blended);
            currentRating.set(player.rank, Math.abs(blended));
            dbg.log(
              `  P${player.rank} [side 1, ${games} games]: BLEND → (${nratingBefore.toFixed(1)} × ${games} + ${playerPerfRating.toFixed(1)}) / ${games + 1} = ${blended.toFixed(1)} → abs = ${Math.abs(blended).toFixed(1)}`,
            );
          }

          matchTrace.playerUpdates.push(update);
          careerGames.set(player.rank, games + 1);
        }
      },
    );

    matchTraces.push(matchTrace);
  }

  // Write nRating to player objects
  dbg.group(`${label}[WRITE BACK] VB6 lines 1600-1610`, () => {
    for (const p of playersCopy) {
      if (playedToday.has(p.rank)) {
        p.nRating = Math.round(currentRating.get(p.rank)!);
        // VB6 line 1613: nrating < 1 → clamp to 1
        if (p.nRating < 1) p.nRating = 1;
        dbg.log(`P${p.rank}: played → nRating = ${p.nRating}`);
      } else {
        p.nRating = 0;
        dbg.log(`P${p.rank}: did NOT play → nRating = 0`);
      }
    }
  });

  return { players: playersCopy, currentRating, playedToday, matchTraces };
}

/**
 * Main entry point for rating calculation.
 * Always runs double-pass averaging:
 *   Pass 1: compute nRating from original player state
 *   Pass 2: recompute using pass 1 nRating as input (affects num_games=0 players)
 *   Average: nRating = round((pass1 + pass2) / 2)
 *
 * This dampens extreme swings for new players and helps ratings converge.
 */
export function calculateRatings(
  playersList: PlayerData[],
  matches: MatchData[],
  options?: {
    /** Override K-factor (default: from settings or 20) */
    kFactorOverride?: number;
    /** When true: prints step-by-step VB6-equivalent trace + returns trace object */
    debugMode?: boolean;
  },
): CalculateRatingsResult {
  const debugMode = options?.debugMode ?? false;
  const dbg = new DebugLogger(debugMode);
  const trace: CalculateRatingsDebugTrace = {
    kFactor: 0,
    init: [],
    matches: [],
    final: [],
  };

  let kFactor = 20;

  if (options?.kFactorOverride !== undefined) {
    kFactor = options.kFactorOverride;
  } else if (typeof localStorage !== "undefined") {
    try {
      const savedSettings = localStorage.getItem("ladder_settings");
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        kFactor = parsed.kFactor ?? 20;
      }
    } catch {}
  }

  trace.kFactor = kFactor;

  // === PASS 1 ===
  const pass1 = calculateRatingsSinglePass(
    playersList,
    matches,
    kFactor,
    debugMode,
    "[PASS 1] ",
  );

  const pass1NRating = new Map<number, number>();
  for (const p of pass1.players) {
    pass1NRating.set(p.rank, p.nRating);
  }

  // Populate trace from pass 1 (for debugMode)
  if (debugMode) {
    for (const p of playersList) {
      trace.init.push({
        rank: p.rank,
        numGames: p.num_games,
        rating: p.rating,
        nRating: p.nRating,
        initNRating: Math.abs(p.num_games === 0 ? (p.nRating > 0 ? p.nRating : p.rating) : p.rating),
      });
    }
    trace.matches = pass1.matchTraces;
  }

  // === PASS 2 ===
  // Feed pass 1 nRating into pass 2. For num_games=0 players, pass 1 nRating
  // becomes the init value (capped at 1800), producing a different second-pass result.
  // For num_games>0 players, init is still from rating column (same as pass 1).
  const pass2 = calculateRatingsSinglePass(
    pass1.players,
    matches,
    kFactor,
    debugMode,
    "[PASS 2] ",
  );

  const pass2NRating = new Map<number, number>();
  for (const p of pass2.players) {
    pass2NRating.set(p.rank, p.nRating);
  }

  // === AVERAGE ===
  dbg.group("[AVERAGE] (pass1 + pass2) / 2", () => {
    for (const p of pass2.players) {
      const n1 = pass1NRating.get(p.rank) ?? 0;
      const n2 = pass2NRating.get(p.rank) ?? 0;
      if (pass1.playedToday.has(p.rank)) {
        p.nRating = Math.round((n1 + n2) / 2);
        // VB6 line 1613: nrating < 1 → clamp to 1
        if (p.nRating < 1) p.nRating = 1;
        dbg.log(`P${p.rank}: (${n1} + ${n2}) / 2 = ${p.nRating}`);
      } else {
        p.nRating = 0;
        dbg.log(`P${p.rank}: did NOT play → nRating = 0`);
      }

      if (debugMode) {
        trace.final.push({
          rank: p.rank,
          played: pass1.playedToday.has(p.rank),
          nRating: p.nRating,
        });
      }
    }
  });

  return {
    players: pass2.players,
    trace: debugMode ? trace : undefined,
    pass1NRating,
    pass2NRating,
  };
}

/**
 * Repopulate game results from validated matches
 */
export function repopulateGameResults(
  playersList: PlayerData[],
  matches: MatchData[],
  numRounds: number = 31,
  _playerResultsByMatch?: Map<string, PlayerMatchResult[]>,
): PlayerData[] {
  const playersCopy = playersList.map((p) => ({
    ...p,
    gameResults: new Array(numRounds).fill(null),
  }));

  const findLowestEmptyRound = (player: PlayerData): number => {
    for (let r = 0; r < numRounds; r++) {
      if (player.gameResults[r] === null) {
        return r;
      }
    }
    return -1;
  };

  const swapScore = (code: number): number => {
    if (code === 0) return 0;
    if (code === 1) return 3;
    if (code === 2) return 2;
    if (code === 3) return 1;
    return 0;
  };

  const buildNormalizedResult = (m: MatchData): string => {
    if (m.player3 > 0 && m.player4 > 0) {
      const pair1 = [m.player1, m.player2].sort((a, b) => a - b);
      const pair2 = [m.player3, m.player4].sort((a, b) => a - b);

      const minPair1 = Math.min(pair1[0], pair1[1]);
      const minPair2 = Math.min(pair2[0], pair2[1]);

      let normPair1: number[],
        normPair2: number[],
        normScore1: number,
        normScore2: number;

      if (minPair1 < minPair2) {
        normPair1 = pair1;
        normPair2 = pair2;
        normScore1 = m.score1;
        normScore2 = m.score2;
      } else {
        normPair1 = pair2;
        normPair2 = pair1;
        normScore1 = swapScore(m.score2);
        normScore2 = swapScore(m.score1);
      }

      const score1Letter =
        normScore1 === 0
          ? "O"
          : normScore1 === 1
            ? "L"
            : normScore1 === 2
              ? "D"
              : "W";
      const score2Letter =
        normScore2 === 0
          ? "O"
          : normScore2 === 1
            ? "L"
            : normScore2 === 2
              ? "D"
              : "W";

      return `${normPair1[0]}:${normPair1[1]}${score1Letter}${score2Letter}${normPair2[0]}:${normPair2[1]}`;
    } else {
      const sortedPair = [m.player1, m.player2].sort((a, b) => a - b);
      const scoreLetter =
        m.score1 === 0
          ? "O"
          : m.score1 === 1
            ? "L"
            : m.score1 === 2
              ? "D"
              : "W";
      return `${sortedPair[0]}${scoreLetter}${sortedPair[1]}`;
    }
  };

  // Track which opponent pairs have already been populated to avoid duplicates
  // 2p: track individual opponents per player
  // 4p: track opposing PAIRS per player (same opponent with different partner is OK)
  const seen2pOpponents = new Map<number, Set<number>>();
  const seen4pOpposingPairs = new Map<number, Set<string>>();

  const ensure2pSet = (rank: number) => {
    if (!seen2pOpponents.has(rank)) seen2pOpponents.set(rank, new Set());
    return seen2pOpponents.get(rank)!;
  };

  const ensure4pSet = (rank: number) => {
    if (!seen4pOpposingPairs.has(rank)) seen4pOpposingPairs.set(rank, new Set());
    return seen4pOpposingPairs.get(rank)!;
  };

  for (const match of matches) {
    const is4p = match.player3 > 0 && match.player4 > 0;
    const p1 = match.player1, p2 = match.player2;
    const p3 = match.player3, p4 = match.player4;

    // Check for duplicates
    if (!is4p) {
      const s1 = ensure2pSet(p1), s2 = ensure2pSet(p2);
      if (s1.has(p2)) continue;
      s1.add(p2);
      s2.add(p1);
    } else {
      // 4p: track opposing pair as a sorted key
      const oppPair = [p3, p4].sort((a, b) => a - b).join("-");
      const allyPair = [p1, p2].sort((a, b) => a - b).join("-");
      const s1 = ensure4pSet(p1), s2 = ensure4pSet(p2);
      const s3 = ensure4pSet(p3), s4 = ensure4pSet(p4);
      if (s1.has(oppPair) || s2.has(oppPair) || s3.has(allyPair) || s4.has(allyPair)) continue;
      s1.add(oppPair); s2.add(oppPair);
      s3.add(allyPair); s4.add(allyPair);
    }

    const normalizedResult = buildNormalizedResult(match);
    const playerRanks = [p1, p2];
    if (is4p) {
      playerRanks.push(p3, p4);
    }

    for (const playerRank of playerRanks) {
      const player = playersCopy.find((p) => p.rank === playerRank);
      if (!player) continue;
      const round = findLowestEmptyRound(player);
      if (round >= 0 && normalizedResult) {
        player.gameResults[round] = normalizedResult + "_";
      }
    }
  }

  return playersCopy;
}

export function validateGameResult(input: string): ValidationResultResult {
  if (!input.trim()) {
    return { isValid: false, error: 3, message: "Incomplete entry" };
  }

  const parsedPlayersList = [0, 0, 0, 0, 0];
  const parsedScoreList = [0, 0];
  const hashValue = string2long(input, parsedPlayersList, parsedScoreList);

  if (hashValue < 0) {
    const errorCode = Math.abs(hashValue);
    console.log('[validateGameResult] Invalid format:', {
      input,
      errorCode,
      parsedPlayers: parsedPlayersList,
      parsedScores: parsedScoreList,
    });
    return {
      isValid: false,
      error: errorCode,
      message: "", // This will be populated by getValidationErrorMessage in the client
    };
  }

  return { isValid: true };
}

export function updatePlayerGameData(
  input: string,
  addUnderscore: boolean = true,
): UpdatePlayerGameDataResult {
  if (!input.trim()) {
    return {
      isValid: false,
      error: 3,
      message: "Incomplete entry",
      originalString: input,
      parsedPlayer1Rank: 0,
      parsedPlayer2Rank: 0,
      parsedPlayer3Rank: 0,
      parsedPlayer4Rank: 0,
    };
  }

  const parsedPlayersList = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const parsedScoreList = [0, 0];
  const hashValue = string2long(input, parsedPlayersList, parsedScoreList);

  if (hashValue < 0) {
    const errorCode = Math.abs(hashValue);
    const parsedPlayer1Rank = parsedPlayersList[5];
    const parsedPlayer2Rank = parsedPlayersList[6];
    const parsedPlayer3Rank = parsedPlayersList[7];
    const parsedPlayer4Rank = parsedPlayersList[8];

    console.log('[updatePlayerGameData] Invalid format:', {
      input,
      errorCode,
      parsedPlayers: parsedPlayersList,
      parsedScores: parsedScoreList,
    });

    return {
      isValid: false,
      error: errorCode,
      message: "",
      parsedPlayersList: parsedPlayersList,
      parsedScoreList: parsedScoreList,
      originalString: input,
      parsedPlayer1Rank,
      parsedPlayer2Rank,
      parsedPlayer3Rank,
      parsedPlayer4Rank,
    };
  }

  const resultString = addUnderscore ? input + "_" : input;
  const parsedPlayer1Rank = parsedPlayersList[5];
  const parsedPlayer2Rank = parsedPlayersList[6];
  const parsedPlayer3Rank = parsedPlayersList[7];
  const parsedPlayer4Rank = parsedPlayersList[8];

  return {
    isValid: true,
    parsedPlayersList: parsedPlayersList,
    parsedScoreList: parsedScoreList,
    originalString: input,
    resultString,
    parsedPlayer1Rank,
    parsedPlayer2Rank,
    parsedPlayer3Rank,
    parsedPlayer4Rank,
  };
}
