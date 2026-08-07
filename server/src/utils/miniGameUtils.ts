import { MINI_GAME_FILES } from '../../../shared/types/index.js';
import { readMiniGameFile } from '../services/tournamentService.js';

/** Normalize a mini-game file name to lowercase and validate against allowed list. */
export function normalizeFileName(input: string | undefined | null): string | null {
  if (!input) return null;
  const lower = String(input).toLowerCase();
  return MINI_GAME_FILES.includes(lower) ? lower : null;
}

export interface MiniGameReadResult {
  header: string[];
  players: any[];
  playerCount: number;
}

/** Shared handler for reading mini-game files. Returns empty data if file not found. */
export async function handleReadMiniGameFile(fileName: string | undefined | null): Promise<MiniGameReadResult> {
  const normFileName = normalizeFileName(fileName);
  if (!normFileName) throw new Error('Invalid mini-game file name');
  const miniGameData = await readMiniGameFile(normFileName);
  if (!miniGameData) {
    return { header: [], players: [], playerCount: 0 };
  }
  return {
    header: miniGameData.header,
    players: miniGameData.players,
    playerCount: miniGameData.players.length,
  };
}
