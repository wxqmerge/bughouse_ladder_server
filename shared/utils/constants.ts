/**
 * Shared constants for the Bughouse Ladder application
 */

export const MINI_GAMES = [
  "BG_Game",
  "Bishop_Game",
  "Pillar_Game",
  "Kings_Cross",
  "Pawn_Game",
  "Queen_Game",
] as const;

export const ERROR_MESSAGES: Record<number, string> = {
  1: "Invalid characters",
  2: "Incomplete 2-player game",
  3: "Incomplete 4-player game",
  4: "Missing result code",
  6: "Duplicate player in game",
  5: "Too many results",
  7: "Missing player 4",
  9: "Player rank exceeds 200",
  10: "Conflicting results - players disagree on outcome",
};

export function getValidationErrorMessage(errorCode: number): string {
  return ERROR_MESSAGES[errorCode] || "Unknown error";
}

import { PlayerData } from "../types";

export function getNextTitle(currentTitle: string): string {
  const normalizedTitle = String(currentTitle || "")
    .toLowerCase()
    .trim();
  const index = MINI_GAMES.findIndex(
    (game) => game.toLowerCase() === normalizedTitle,
  );
  if (index !== -1) {
    return MINI_GAMES[(index + 1) % MINI_GAMES.length];
  }
  return currentTitle;
}

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
        rating: player.nRating,
        nRating: 0, // Reset so next recalc reads from rating column
       num_games: (player.num_games || 0) + gameCount,
       attendance: newAttendance,
       gameResults: Array(31).fill(null),
     };
  });

  if (!reRank) {
    return newDayPlayers;
  }

  const sortedPlayers = [...newDayPlayers].sort((a, b) => {
    const pseudoA = a.trophyEligible !== false ? a.rating : -a.rating;
    const pseudoB = b.trophyEligible !== false ? b.rating : -b.rating;

    if (pseudoA !== pseudoB) return pseudoB - pseudoA;
    return a.rank - b.rank;
  });

  return sortedPlayers.map((player, index) => ({
    ...player,
    rank: index + 1,
  }));
}
