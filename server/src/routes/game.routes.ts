import { Router, Request, Response } from 'express';
import { requireUserKey } from '../middleware/auth.middleware.js';
import { writeLimiter } from '../middleware/rateLimit.middleware.js';
import { readLadderFile, writeLadderFile, PlayerData, withTiming } from '../services/dataService.js';
import { broadcastSSEEvent } from '../services/sseService.js';
import { validateGameResult, validateDeltasArray } from '../utils/validation.js';

const router = Router();

// All game processing logic will be imported from shared in a separate file
// For now, we'll use basic validation

// Submit a single game result (requires user or admin API key)
router.post('/submit', requireUserKey, writeLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { playerRank, round, result } = validateGameResult(req.body);

    // Basic validation for result format (will be enhanced with shared validation)
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
      player.gameResults = new Array(31).fill(null);
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
    if (!req.body || typeof req.body !== 'object' || !('games' in req.body)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid games data' },
      });
      return;
    }

    const games = validateDeltasArray((req.body as { games: unknown }).games);

    const ladderData = await withTiming(`readLadderFile(batch)`, readLadderFile);
    const results: Array<{ playerRank: number; round?: number; success?: boolean; error?: string }> = [];

    for (const game of games) {
      const playerIndex = ladderData.players.findIndex((p: PlayerData) => p.rank === game.playerRank);

      if (playerIndex === -1) {
        results.push({ playerRank: game.playerRank, error: 'Player not found' });
        continue;
      }

      const player = ladderData.players[playerIndex];
      if (!player.gameResults) {
        player.gameResults = new Array(31).fill(null);
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
