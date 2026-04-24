/**
 * Debug trace for a single match — mirrors VB6 intermediate values step by step.
 * Each field corresponds to a VB6 variable at a specific point in the recalc() flow.
 */
export interface MatchDebugTrace {
  /** VB6: parse_entry result */
  match: string;
  /** VB6: players array after player2row */
  players: number[];
  /** VB6: scores array (critical: scores(1)=0 for 2-player, >0 for 4-player) */
  scores: number[];
  /** VB6: sides(0) and sides(1) before any adjustment */
  sideRatings: [number, number];
  /** VB6: perf = formula(sides(0), sides(1)) */
  expected: number;
  /** VB6: perfs after first loop (W/L/D component) */
  wldPerfs: [number, number];
  /** VB6: sides after perf adjustment (used for blending) */
  perfRatings: [number, number];
  /** VB6: perfs after second loop (W/L/D + expected diff) */
  eloPerfs: [number, number];
  /** VB6: per-player nRating updates */
  playerUpdates: PlayerDebugUpdate[];
}

/** VB6: per-player update (one per player in the match) */
export interface PlayerDebugUpdate {
  /** Player rank */
  rank: number;
  /** VB6: myside (0 or 1) */
  mySide: number;
  /** VB6: num_games before increment */
  numGamesBefore: number;
  /** Current nRating before update */
  nRatingBefore: number;
  /** Which formula was used: "elo" (>9 games) or "blend" (<=9 games) */
  formula: "elo" | "blend";
  /** If blend: the opposing side's perfRating used */
  opposingPerfRating?: number;
  /** If elo: the K-factor applied */
  kFactor?: number;
  /** VB6: nRating after update (before Abs) */
  nRatingAfterRaw: number;
  /** VB6: nRating after Abs */
  nRatingAfter: number;
  /** VB6: num_games after increment */
  numGamesAfter: number;
}

/** Full trace for a calculateRatings() call */
export interface CalculateRatingsDebugTrace {
  /** VB6: k_val from settings */
  kFactor: number;
  /** Per-player initialization (VB6 lines 1422-1449) */
  init: Array<{
    rank: number;
    numGames: number;
    rating: number;
    nRating: number;
    /** VB6: nrating after init (from rating or nRating, capped at 1200) */
    initNRating: number;
  }>;
  /** Per-match traces */
  matches: MatchDebugTrace[];
  /** Final nRating written to each player (VB6 lines 1600-1610) */
  final: Array<{
    rank: number;
    played: boolean;
    nRating: number;
  }>;
}

/**
 * Debug logger — only prints when debugMode is true.
 * Produces structured output that mirrors VB6 Debug.Print statements.
 */
export class DebugLogger {
  private indent = 0;
  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  log(...args: unknown[]): void {
    if (!this.enabled) return;
    console.log("  ".repeat(this.indent), ...args);
  }

  group(label: string, fn: () => void): void {
    if (!this.enabled) {
      fn();
      return;
    }
    console.group(label);
    this.indent++;
    fn();
    this.indent--;
    console.groupEnd();
  }

  separator(): void {
    if (!this.enabled) return;
    console.log("---");
  }
}
