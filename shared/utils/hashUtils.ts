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
 * Uses blended performance rating for players with fewer than 10 games.
 */
export function calculateRatings(
  playersList: PlayerData[],
  matches: MatchData[],
  _kFactorOverride?: number,
): PlayerData[] {
  let kFactor = 20;
  let perfBlendingFactor = 0.99;

  if (_kFactorOverride !== undefined) {
    kFactor = _kFactorOverride;
  } else if (typeof localStorage !== "undefined") {
    try {
      const savedSettings = localStorage.getItem("ladder_settings");
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        kFactor = parsed.kFactor ?? 20;
        perfBlendingFactor = parsed.performanceBlendingFactor ?? 0.99;
      }
    } catch {}
  }

  const EloKfactor = kFactor;
  const playersCopy = playersList.map((p) => ({ ...p }));

  // Snapshot effective ratings and trophy eligibility before Elo loop starts mutating nRating
  const effectiveRatings = new Map<number, number>();
  const savedEligibility = new Map<number, boolean>();
  for (const p of playersCopy) {
    const eff = p.nRating > 0 ? p.nRating : p.rating;
    effectiveRatings.set(p.rank, Math.abs(eff));
    savedEligibility.set(p.rank, p.trophyEligible);
  }

  // Track per-player stats for performance rating calculation
  interface PlayerGameStats {
    score: number;
    opponentRatings: number[];
    gamesToday: number;
  }
  const gameStats = new Map<number, PlayerGameStats>();

  function getOpponentRating(player: PlayerData): number {
    const cached = effectiveRatings.get(player.rank);
    return cached !== undefined ? cached : Math.abs(player.rating);
  }

  for (const match of matches) {
    const p1 = playersCopy.find((p) => p.rank === match.player1);
    const p2 = playersCopy.find((p) => p.rank === match.player2);

    if (!p1 || !p2) continue;

    // Track opponent ratings (use current nRating or rating)
    const p1OppRating = getOpponentRating(p2);
    const p2OppRating = getOpponentRating(p1);

    // Initialize game stats
    if (!gameStats.has(p1.rank)) {
      gameStats.set(p1.rank, { score: 0, opponentRatings: [], gamesToday: 0 });
    }
    if (!gameStats.has(p2.rank)) {
      gameStats.set(p2.rank, { score: 0, opponentRatings: [], gamesToday: 0 });
    }

    const stats1 = gameStats.get(p1.rank)!;
    const stats2 = gameStats.get(p2.rank)!;

    stats1.gamesToday++;
    stats2.gamesToday++;
    stats1.opponentRatings.push(p1OppRating);
    stats2.opponentRatings.push(p2OppRating);

    const p1Rating = Math.abs(p1.rating);
    const p2Rating = Math.abs(p2.rating);

    if (p1Rating === 0 && p2Rating === 0) continue;

    const expectedP1 = formula(p1Rating, p2Rating);
    const expectedP2 = formula(p2Rating, p1Rating);

    let actualP1 = 0.5;
    let actualP2 = 0.5;

    if (match.score1 === 3) {
      actualP1 = 1;
      actualP2 = 0;
    } else if (match.score1 === 1) {
      actualP1 = 0;
      actualP2 = 1;
    }

    // Accumulate score for performance rating
    stats1.score += actualP1;
    stats2.score += actualP2;

    const p1NewRating = Math.round(
      p1Rating + EloKfactor * (actualP1 - expectedP1),
    );
    const p2NewRating = Math.round(
      p2Rating + EloKfactor * (actualP2 - expectedP2),
    );

    p1.trophyEligible = p1NewRating >= 0;
    p2.trophyEligible = p2NewRating >= 0;
    p1.nRating = Math.abs(p1NewRating);
    p2.nRating = Math.abs(p2NewRating);
  }

  // Post-loop: restore saved eligibility for players who didn't play today
  // Only compute fresh eligibility for players who participated in matches
  for (const player of playersCopy) {
    const stats = gameStats.get(player.rank);
    if (!stats || stats.gamesToday === 0) {
      player.trophyEligible = savedEligibility.get(player.rank) ?? true;
      continue;
    }

    const selfEffectiveRating = effectiveRatings.get(player.rank) ?? Math.abs(player.rating);
    const totalRatings = stats.opponentRatings.reduce((a, b) => a + b, 0) + selfEffectiveRating;
    const avgRating = totalRatings / (stats.opponentRatings.length + 1);

    const winRate = stats.score / stats.gamesToday;
    let perfRating: number;
    if (winRate > 0.5) {
      perfRating = avgRating + 200;
    } else if (winRate < 0.5) {
      perfRating = avgRating - 200;
    } else {
      perfRating = avgRating;
    }

    perfRating = Math.max(-9999, Math.min(9999, perfRating));

    if (player.num_games === 0) {
      const perfRounded = Math.round(perfRating);
      player.trophyEligible = perfRounded >= 0;
      player.nRating = Math.abs(perfRounded);
    } else if (player.num_games < 10) {
      const totalGames = player.num_games + stats.gamesToday;
      const blendedRating =
        perfBlendingFactor *
        ((Math.abs(player.rating) * player.num_games + perfRating * stats.gamesToday) /
          totalGames);
      const clampedBlended = Math.max(-9999, Math.min(9999, Math.round(blendedRating)));
      player.trophyEligible = clampedBlended >= 0;
      player.nRating = Math.abs(clampedBlended);
    }
  }

  return playersCopy;
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

  for (const match of matches) {
    const normalizedResult = buildNormalizedResult(match);

    const playerRanks = [match.player1, match.player2];
    if (match.player3 > 0 && match.player4 > 0) {
      playerRanks.push(match.player3, match.player4);
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
