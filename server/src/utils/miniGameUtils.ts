import { MINI_GAME_FILES } from '../../../shared/types/index.js';

/** Normalize a mini-game file name to lowercase and validate against allowed list. */
export function normalizeFileName(input: string | undefined | null): string | null {
  if (!input) return null;
  const lower = String(input).toLowerCase();
  return MINI_GAME_FILES.includes(lower) ? lower : null;
}
