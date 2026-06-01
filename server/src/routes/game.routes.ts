import { Router, Request, Response } from 'express';
import { requireUserKey } from '../middleware/auth.middleware.js';
import { writeLimiter } from '../middleware/rateLimit.middleware.js';
import { readLadderFile, writeLadderFile, PlayerData, withTiming } from '../services/dataService.js';
import { broadcastSSEEvent } from '../services/sseService.js';
import { NUM_ROUNDS } from '../../../shared/utils/constants.js';

interface GameResult {
  playerRank: number;
  round: number;
  result: string;
}

const router = Router();

function isValidGameResult(obj: unknown): obj is GameResult {
  if (!obj || typeof obj !== 'object') return false;
  const g = obj as Record<string, unknown>;
  return (
    typeof g.playerRank === 'number' &&
    typeof g.round === 'number' &&
    typeof g.result === 'string'
  );
}

// Submit a single game result (requires user or admin API key)
router.post('/', requireUserKey, writeLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as unknown;
    if (!isValidGameResult(body)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid game result: playerRank (number), round (number), result (string) required' },
      });
      return;
    }
   const { playerRank, round, result } = body;

    if (playerRank <= 0 || round < 0) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid playerRank or round' },
      });
      return;
    }

    // Basic validation for result format
    if (!/^\d[LDW]\d(_)?$/.test(result) && !/^\d:\d[LDW][LDW]?\d:\d(_)?$/.test(result)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid result format' },
      });
      return;
    }

    const ladderData = await readLadderFile();
    const playerIndex = ladderData.players.findIndex((p: PlayerData) => p.rank === playerRank);

    if (playerIndex === -1) {
      res.status(404).json({
        success: false,
        error: { message: 'Player not found' },
      });
      return;
    }

    // Ensure gameResults array exists and has enough slots
    const player = ladderData.players[playerIndex];
    if (!player.gameResults) {
      player.gameResults = new Array(NUM_ROUNDS).fill(null);
    }
    while (player.gameResults.length <= round) {
      player.gameResults.push(null);
    }

    // Store the result
    player.gameResults[round] = result;
    ladderData.players[playerIndex] = player;

    await writeLadderFile(ladderData);

    broadcastSSEEvent('gameSubmitted', { playerRank, round, result, type: 'gameSubmit' });

    res.json({
      success: true,
      data: { message: 'Game result submitted', playerRank, round, result },
    });
  } catch (error) {
    console.error('Error submitting game:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to submit game' },
    });
  }
});

// Submit multiple game results (requires user or admin API key)
router.post('/batch', requireUserKey, writeLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as { games?: unknown };
    const games = body.games;

    if (!games || !Array.isArray(games)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid games data' },
      });
      return;
    }

    const invalidGames = games.map((g: unknown, i: number) => isValidGameResult(g) ? -1 : i).filter(i => i !== -1);
    if (invalidGames.length > 0) {
      res.status(400).json({
        success: false,
        error: { message: `Games at index(es) ${invalidGames.join(', ')} missing required fields` },
      });
      return;
    }

    const ladderData = await withTiming(`readLadderFile(batch)`, readLadderFile);
    const results: Array<{ playerRank: number; round: number; success: boolean } | { playerRank: number; error: string }> = [];

    for (const game of games as GameResult[]) {
      const playerIndex = ladderData.players.findIndex((p: PlayerData) => p.rank === game.playerRank);
      
      if (playerIndex === -1) {
        results.push({ playerRank: game.playerRank, error: 'Player not found' });
        continue;
      }

      const player = ladderData.players[playerIndex];
      if (!player.gameResults) {
        player.gameResults = new Array(NUM_ROUNDS).fill(null);
      }
      while (player.gameResults.length <= game.round) {
        player.gameResults.push(null);
      }

      player.gameResults[game.round] = game.result;
      ladderData.players[playerIndex] = player;
      results.push({ playerRank: game.playerRank, round: game.round, success: true });
    }

    await withTiming(`writeLadderFile(batch-${games.length})`, () => writeLadderFile(ladderData));

    broadcastSSEEvent('gamesSubmitted', { type: 'batchGameSubmit', count: games.length });

    res.json({
      success: true,
      data: { message: 'Game results submitted', results },
    });
  } catch (error) {
    console.error('Error submitting games batch:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to submit games' },
    });
  }
});

export { router };
