import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth.middleware.js';
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

// Update player data (requires authentication and admin role for bulk operations)
router.put('/:rank', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
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

    // Update player fields (non-admin users can only update their own game results)
    const updatedPlayer = { ...ladderData.players[playerIndex] };
    
    if (req.user?.role === 'admin') {
      // Admin can update all fields
      Object.keys(req.body).forEach(key => {
        if (key !== 'rank' && key !== 'gameResults') {
          (updatedPlayer as any)[key] = req.body[key];
        }
      });
    }

    // Everyone can update game results (validation happens in game routes)
    if (req.body.gameResults) {
      updatedPlayer.gameResults = req.body.gameResults;
    }

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

// Clear a single game result cell (requires authentication)
router.delete('/:rank/round/:roundIndex', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
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

// Bulk update players (requires authentication - admin can update all, users can update game results)
router.put('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
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
    
    // Merge incoming player data with existing data based on permissions
    for (const incomingPlayer of players) {
      const existingIndex = ladderData.players.findIndex(p => p.rank === incomingPlayer.rank);
      if (existingIndex !== -1) {
        const existingPlayer = ladderData.players[existingIndex];
        
        if (req.user?.role === 'admin') {
          // Admin can update all fields except rank
          ladderData.players[existingIndex] = {
            ...incomingPlayer,
            rank: existingPlayer.rank, // Preserve original rank
          };
        } else {
          // Non-admin users can only update gameResults
          existingPlayer.gameResults = incomingPlayer.gameResults;
          ladderData.players[existingIndex] = existingPlayer;
        }
      }
    }

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
