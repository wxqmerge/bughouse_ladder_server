import { Router, Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware.js';
import {
  readLadderFile,
  writeLadderFile,
  PlayerData,
  LadderData,
} from '../services/dataService.js';

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
    console.error('Error reading ladder:', error);
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
    console.error('Error fetching player:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch player' },
    });
  }
});

// Update player data (no auth required - local use)
router.put('/:rank', async (req: Request, res: Response): Promise<void> => {
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
    console.error('Error updating player:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update player' },
    });
  }
});

// Clear a single game result cell (no auth required - local use)
router.delete('/:rank/round/:roundIndex', async (req: Request, res: Response): Promise<void> => {
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
    console.error('Error clearing cell:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to clear cell' },
    });
  }
});

// Bulk update players (no auth required - full access for local use)
router.put('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { players } = req.body as { players: PlayerData[] };
    
    if (!players || !Array.isArray(players)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid players data' },
      });
      return;
    }

    const ladderData: LadderData = await readLadderFile();
    ladderData.players = players;
    
    // Re-index ranks
    ladderData.players = ladderData.players.map((player: PlayerData, index: number) => ({
      ...player,
      rank: index + 1,
    }));

    await writeLadderFile(ladderData);

    res.json({
      success: true,
      data: { message: 'Players updated successfully', count: players.length },
    });
  } catch (error) {
    console.error('Error bulk updating players:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to update players' },
    });
  }
});

export { router };
