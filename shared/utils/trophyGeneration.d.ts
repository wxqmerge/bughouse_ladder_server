/**
 * Shared trophy generation logic
 * Used by both server (tournamentStore) and client (miniGameStore)
 */
import { PlayerData } from '../types/index.js';
export interface MiniGameData {
    fileName: string;
    players: PlayerData[];
}
export interface TrophyReportResult {
    success: boolean;
    message: string;
    trophies?: any[];
    isClubMode?: boolean;
    debugInfo?: string;
}
export declare function debugLine(col1: string, col2?: string, col3?: string, col4?: string, col5?: string, col6?: string, col7?: string, col8?: string): string;
export declare function copyPlayersToTarget(sourcePlayers: PlayerData[], targetPlayers: PlayerData[]): PlayerData[];
export declare function mergeGameResults(oldResults: (string | null)[], currentResults: (string | null)[]): (string | null)[];
export declare function clubLadderGamesPlayed(player: PlayerData): number;
export declare function generateClubLadderTrophies(players: PlayerData[], maxTrophies: number): any[];
export declare function generateMiniGameTrophies(players: PlayerData[], maxTrophies: number, miniGameFiles: MiniGameData[]): any[];
//# sourceMappingURL=trophyGeneration.d.ts.map