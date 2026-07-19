/**
 * Shared constants for the Bughouse Ladder application
 */

import { DEFAULT_GAME_RESULTS } from '../constants.js';
export { NUM_ROUNDS, DEFAULT_GAME_RESULTS } from '../constants.js';

export const MINI_GAMES_WITH_BUGHOUSE = [
  "BG_Game",
  "Bishop_Game",
  "Pillar_Game",
  "Kings_Cross",
  "Pawn_Game",
  "Queen_Game",
  "Bughouse",
] as const;

/** Fixed keyboard shortcut mapping for ladder switching (Ctrl+1 through Ctrl+8) */
export const LADDER_SHORTCUTS: Record<string, number> = Object.fromEntries(
  ["Ladder", ...MINI_GAMES_WITH_BUGHOUSE].map((title, i) => [title, i + 1])
);

/** Reverse mapping: shortcut number → title */
export const SHORTCUT_TO_TITLE: Record<number, string> = Object.fromEntries(
  Object.entries(LADDER_SHORTCUTS).map(([title, num]) => [num, title])
) as Record<number, string>;

/** Per-ladder colors: 60% black + 40% base color. Constant for each ladder. */
export const LADDER_COLORS: Record<string, string> = {
  "Ladder": "#555555",
  "BG_Game": "#664400",
  "Bishop_Game": "#553366",
  "Pillar_Game": "#334455",
  "Kings_Cross": "#553333",
  "Pawn_Game": "#335533",
  "Queen_Game": "#333355",
  "Bughouse": "#444444",
};

export function isMiniGameTitle(title: string): boolean {
  const normalized = String(title || "").toLowerCase().trim();
  return MINI_GAMES_WITH_BUGHOUSE.some(game => game.toLowerCase() === normalized);
}

export function titleToFileName(title: string): string {
   const normalized = String(title || "").toLowerCase().trim();
   return `${normalized}.tab`;
 }

 export function fileNameToTitle(fileName: string): string {
   const normalized = String(fileName || "").trim();
   if (normalized.toLowerCase() === "bughouse.tab") {
     return "Bughouse";
   }
   const withoutExt = normalized.replace(/\.tab$/i, "");
   const match = MINI_GAMES_WITH_BUGHOUSE.find(g => g.toLowerCase() === withoutExt.toLowerCase());
   return match || withoutExt;
 }

export const ERROR_MESSAGES: Record<number, string> = {
  1: "Invalid characters",
  2: "Invalid 2-player format",
  3: "Incomplete game entry",
  4: "Missing result code",
  5: "Too many results",
  6: "Duplicate player in game",
  7: "Missing player 4",
  8: "Missing player in game",
  9: "Player rank exceeds 200",
  10: "Conflicting results - players disagree on outcome",
  11: "Player rank does not exist in ladder",
};

export function getValidationErrorMessage(errorCode: number): string {
  return ERROR_MESSAGES[errorCode] || "Unknown error";
}

export function getNextTitle(currentTitle: string): string {
  const normalizedTitle = String(currentTitle || "")
    .toLowerCase()
    .trim();
  const index = MINI_GAMES_WITH_BUGHOUSE.findIndex(
    (game) => game.toLowerCase() === normalizedTitle,
  );
  if (index !== -1) {
    return MINI_GAMES_WITH_BUGHOUSE[(index + 1) % MINI_GAMES_WITH_BUGHOUSE.length];
  }
  return currentTitle;
}

import { PlayerData } from "../types/index.js";

export function processNewDayTransformations(
  players: PlayerData[],
  reRank: boolean,
): PlayerData[] {
  const newDayPlayers = players.map((player) => {
    const gameCount = (player.gameResults || []).filter(
      (r) => r !== null && r !== "",
    ).length;

    const newAttendance =
      gameCount > 0 ? 0 : ((player.attendance as number) || 0) + 1;

   return {
       ...player,
        rating: player.nRating > 0 ? player.nRating : player.rating,
        nRating: 0, // Reset so next recalc reads from rating column
       num_games: (player.num_games || 0) + gameCount,
       attendance: newAttendance,
        gameResults: [...DEFAULT_GAME_RESULTS],
     };
  });

  if (!reRank) {
    return newDayPlayers;
  }

  const sortedPlayers = [...newDayPlayers].sort((a, b) => compareByPseudoRating(a, b, p => p.rating));

  return sortedPlayers.map((player, index) => ({
    ...player,
    rank: index + 1,
  }));
}

export function compareByPseudoRating<T extends { trophyEligible?: boolean | undefined; rank: number }>(
  a: T,
  b: T,
  ratingFn: (p: T) => number
): number {
  const pseudoA = a.trophyEligible !== false ? ratingFn(a) : -ratingFn(a);
  const pseudoB = b.trophyEligible !== false ? ratingFn(b) : -ratingFn(b);
  if (pseudoA !== pseudoB) return pseudoB - pseudoA;
  return a.rank - b.rank;
}

export function formatRatingForExport(rating: number | undefined, trophyEligible: boolean | undefined | null): string {
  if (trophyEligible === false) {
    return `-${rating}`;
  }
  return String(rating);
}
