import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.middleware.js';
import { readLadderFile, writeLadderFile, PlayerData } from '../services/dataService.js';

const router = Router();

// All game processing logic will be imported from shared in a separate file
// For now, we'll use basic validation

interface GameResult {
  playerRank: number;
  round: number;
  result: string;
}

// Submit a single game result (requires authentication)
router.post('/submit', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { playerRank, round, result } = req.body as GameResult;

    if (!playerRank || !round || !result) {
      res.status(400).json({
        success: false,
        error: { message: 'Missing required fields' },
      });
      return;
    }

    if (typeof playerRank !== 'number' || typeof round !== 'number') {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid data types' },
      });
      return;
    }

    // Basic validation for result format (will be enhanced with shared validation)
    if (!/^\d[LDW]\d(_)?$/.test(result) && !/^\d:\d[LDW][LDW]?\d:\d(_)?$/.test(result)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid result format' },
      });
      return;
    }

    // Admins can submit for any player
    if (req.user?.role !== 'admin') {
      // Non-admin users must be assigned to a player rank via the 'assignedRank' field
      // This should be set when creating user accounts or through admin panel
      const assignedRank = (req.user as any).assignedRank;
      if (assignedRank !== undefined && assignedRank !== playerRank) {
        res.status(403).json({
          success: false,
          error: { message: 'You can only submit game results for your own rank' },
        });
        return;
      }
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

// Submit multiple game results (requires authentication)
router.post('/batch', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { games } = req.body as { games: GameResult[] };

    if (!games || !Array.isArray(games)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid games data' },
      });
      return;
    }

    // Verify authorization for each game submission
    if (req.user?.role !== 'admin') {
      const assignedRank = (req.user as any).assignedRank;
      if (assignedRank !== undefined) {
        const unauthorizedGames = games.filter(g => g.playerRank !== assignedRank);
        if (unauthorizedGames.length > 0) {
          res.status(403).json({
            success: false,
            error: { message: 'You can only submit game results for your own rank' },
          });
          return;
        }
      }
    }

    const ladderData = await readLadderFile();
    const results: any[] = [];

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

    await writeLadderFile(ladderData);

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

// Get game results for a specific player
router.get('/player/:rank', async (req: Request, res: Response): Promise<void> => {
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
      data: {
        playerRank: player.rank,
        playerName: `${player.firstName} ${player.lastName}`,
        gameResults: player.gameResults || [],
      },
    });
  } catch (error) {
    console.error('Error fetching game results:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to fetch game results' },
    });
  }
});

export { router };
