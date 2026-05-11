import { Router, Request, Response } from 'express';
import { AuthRequest, requireUserKey } from '../middleware/auth.middleware.js';
import { writeLimiter } from '../middleware/rateLimit.middleware.js';
import {
  readLadderFile,
  writeLadderFile,
  PlayerData,
  LadderData,
  withTiming,
} from '../services/dataService.js';
import { log, logError } from '../utils/logger.js';

const router = Router();

// Get all ladder data (public read access)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const ladderData = await readLadderFile();
    res.json({
      success: true,
      data: {
        header: ladderData.header,
        players: ladderData.players,
        playerCount: ladderData.players.length,
      },
    });
  } catch (error) {
    logError('[SERVER]', 'Error reading ladder:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to read ladder data' },
    });
  }
});

// Get single player by rank
router.get('/:rank', async (req: Request, res: Response): Promise<void> => {
  try {
    const rank = parseInt(req.params.rank);
    if (isNaN(rank) || rank < 1) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid rank' },
      });
      return;
    }

    const ladderData = await readLadderFile();
    const player = ladderData.players.find((p: PlayerData) => p.rank === rank);

    if (!player) {
      res.status(404).json({
        success: false,
        error: { message: 'Player not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: player,
    });
  } catch (error) {
    logError('[SERVER]', 'Error fetching player:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch player' },
    });
  }
});

// Update player data (requires user or admin API key)
router.put('/:rank', requireUserKey, writeLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const rank = parseInt(req.params.rank);
    if (isNaN(rank) || rank < 1) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid rank' },
      });
      return;
    }

    const ladderData = await readLadderFile();
    const playerIndex = ladderData.players.findIndex((p: PlayerData) => p.rank === rank);

    if (playerIndex === -1) {
      res.status(404).json({
        success: false,
        error: { message: 'Player not found' },
      });
      return;
    }

    // Update player fields (full access for local use)
    const updatedPlayer = { ...ladderData.players[playerIndex] };
    Object.keys(req.body).forEach(key => {
      if (key !== 'rank') {
        (updatedPlayer as any)[key] = req.body[key];
      }
    });

    ladderData.players[playerIndex] = updatedPlayer;
    await writeLadderFile(ladderData);

    res.json({
      success: true,
      data: updatedPlayer,
    });
  } catch (error) {
    logError('[SERVER]', 'Error updating player:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update player' },
    });
  }
});

// Clear a single game result cell (requires user or admin API key)
router.delete('/:rank/round/:roundIndex', requireUserKey, writeLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const rank = parseInt(req.params.rank);
    const roundIndex = parseInt(req.params.roundIndex);

    if (isNaN(rank) || rank < 1 || isNaN(roundIndex) || roundIndex < 0 || roundIndex > 30) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid rank or round index' },
      });
      return;
    }

    const ladderData = await readLadderFile();
    const playerIndex = ladderData.players.findIndex((p: PlayerData) => p.rank === rank);

    if (playerIndex === -1) {
      res.status(404).json({
        success: false,
        error: { message: 'Player not found' },
      });
      return;
    }

    const player = ladderData.players[playerIndex];
    
    // Clear the cell
    if (!player.gameResults) {
      player.gameResults = new Array(31).fill(null);
    }
    player.gameResults[roundIndex] = null;

    await writeLadderFile(ladderData);

    res.json({
      success: true,
      data: { 
        message: 'Cell cleared',
        rank,
        roundIndex 
      },
    });
  } catch (error) {
    logError('[SERVER]', 'Error clearing cell:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to clear cell' },
    });
  }
});

// Bulk update players (requires user or admin API key)
router.put('/', requireUserKey, writeLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { players } = req.body as { players: PlayerData[] };
    
    if (!players || !Array.isArray(players)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid players data' },
      });
      return;
    }

    const ladderData: LadderData = await withTiming(`readLadderFile(bulk)`, readLadderFile);
    ladderData.players = players;

    await withTiming(`writeLadderFile(bulk-${players.length})`, () => writeLadderFile(ladderData));

    res.json({
      success: true,
      data: { message: 'Players updated successfully', count: players.length },
    });
  } catch (error) {
    logError('[SERVER]', 'Error bulk updating players:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update players' },
    });
  }
});

// Batch update game results (requires user or admin API key)
router.post('/batch', requireUserKey, writeLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { deltas } = req.body as { deltas: Array<{ playerRank: number; round: number; result: string }> };

    if (!deltas || !Array.isArray(deltas)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid deltas data' },
      });
      return;
    }

    const ladderData = await withTiming(`readLadderFile(batch)`, readLadderFile);
    const results: any[] = [];

    for (const delta of deltas) {
      const playerIndex = ladderData.players.findIndex((p: PlayerData) => p.rank === delta.playerRank);

      if (playerIndex === -1) {
        results.push({ playerRank: delta.playerRank, error: 'Player not found' });
        continue;
      }

      const player = ladderData.players[playerIndex];
      if (!player.gameResults) {
        player.gameResults = new Array(31).fill(null);
      }
      while (player.gameResults.length <= delta.round) {
        player.gameResults.push(null);
      }

      player.gameResults[delta.round] = delta.result;
      ladderData.players[playerIndex] = player;
      results.push({ playerRank: delta.playerRank, round: delta.round, success: true });
    }

    await withTiming(`writeLadderFile(batch-${deltas.length})`, () => writeLadderFile(ladderData));

    res.json({
      success: true,
      data: { message: 'Game results submitted', results },
    });
  } catch (error) {
    logError('[SERVER]', 'Error submitting deltas batch:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to submit deltas' },
    });
  }
});

export { router };
