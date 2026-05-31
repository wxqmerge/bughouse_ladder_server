import { Router, Request, Response } from 'express';
import { requireUserKey } from '../middleware/auth.middleware.js';
import { writeLimiter } from '../middleware/rateLimit.middleware.js';
import {
  readLadderFile,
  writeLadderFile,
  PlayerData,
  LadderData,
  withTiming,
} from '../services/dataService.js';
import { log, logError } from '../utils/logger.js';
import { broadcastSSEEvent } from '../services/sseService.js';
import { checkMiniGameFilesWith, readMiniGameFile, writeMiniGameFile, MINI_GAME_FILES } from '../services/tournamentService.js';
import { deduplicatePlayers } from '../../../shared/utils/dedupUtils.js';

const router = Router();

// Get all ladder data (public read access)
router.get('/', async (_req: Request, res: Response): Promise<void> => {
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

    broadcastSSEEvent('playerUpdated', { rank: updatedPlayer.rank, type: 'playerUpdate' });

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

    broadcastSSEEvent('cellCleared', { rank, round: roundIndex, type: 'cellClear' });

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

function isValidPlayerData(obj: unknown): obj is PlayerData {
  if (!obj || typeof obj !== 'object') return false;
  const p = obj as Record<string, unknown>;
  return (
    typeof p.rank === 'number' &&
    typeof p.group === 'string' &&
    typeof p.lastName === 'string' &&
    typeof p.firstName === 'string' &&
    typeof p.rating === 'number' &&
    typeof p.nRating === 'number' &&
    typeof p.trophyEligible === 'boolean' &&
    typeof p.grade === 'string' &&
    typeof p.num_games === 'number' &&
    typeof p.attendance === 'number' &&
    typeof p.info === 'string' &&
    typeof p.phone === 'string' &&
    typeof p.school === 'string' &&
    typeof p.room === 'string' &&
    Array.isArray(p.gameResults)
  );
}

function isValidDelta(obj: unknown): obj is { playerRank: number; round: number; result: string } {
  if (!obj || typeof obj !== 'object') return false;
  const d = obj as Record<string, unknown>;
  return (
    typeof d.playerRank === 'number' &&
    typeof d.round === 'number' &&
    typeof d.result === 'string'
  );
}

// Bulk update players (requires user or admin API key)
router.put('/', requireUserKey, writeLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as { players?: unknown };
    const players = body.players;

    if (!players || !Array.isArray(players)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid players data' },
      });
      return;
    }

    const invalidIndices = players.map((p, i) => isValidPlayerData(p) ? -1 : i).filter(i => i !== -1);
    if (invalidIndices.length > 0) {
      res.status(400).json({
        success: false,
        error: { message: `Players at index(es) ${invalidIndices.join(', ')} missing required fields` },
      });
      return;
    }

    const typedPlayers = players as PlayerData[];

    const ladderData: LadderData = await withTiming(`readLadderFile(bulk)`, readLadderFile);

    // Log game results that contain W/L for bulk save
    for (const p of typedPlayers) {
      if (p.gameResults) {
        for (let r = 0; r < p.gameResults.length; r++) {
          const result = p.gameResults[r];
          if (result && /[\w]/i.test(result[2] || '')) {
            console.log('[SERVER_BULK] P' + p.rank + ' R' + r + ': "' + result + '"');
          }
        }
      }
    }

    // Deduplicate players before saving to prevent duplicate entries
    const beforeCount = typedPlayers.length;
    ladderData.players = deduplicatePlayers(typedPlayers);
    const afterCount = ladderData.players.length;
    if (beforeCount !== afterCount) {
      log('[SERVER_BULK]', `Deduplicated ${beforeCount} -> ${afterCount} players (${beforeCount - afterCount} duplicates removed)`);
    }

    await withTiming(`writeLadderFile(bulk-${afterCount})`, () => writeLadderFile(ladderData));

    broadcastSSEEvent('ladderUpdated', { type: 'bulkUpdate', count: typedPlayers.length });

    res.json({
      success: true,
      data: { message: 'Players updated successfully', count: typedPlayers.length },
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
    const body = req.body as { deltas?: unknown };
    const deltas = body.deltas;

    if (!deltas || !Array.isArray(deltas)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid deltas data' },
      });
      return;
    }

    const invalidDeltas = deltas.map((d, i) => isValidDelta(d) ? -1 : i).filter(i => i !== -1);
    if (invalidDeltas.length > 0) {
      res.status(400).json({
        success: false,
        error: { message: `Deltas at index(es) ${invalidDeltas.join(', ')} missing required fields` },
      });
      return;
    }

    const typedDeltas = deltas as Array<{ playerRank: number; round: number; result: string }>;

    const ladderData = await withTiming(`readLadderFile(batch)`, readLadderFile);
    const results: any[] = [];

    console.log('[SERVER_BATCH] Received deltas:', JSON.stringify(typedDeltas));

    for (const delta of typedDeltas) {
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

      const oldResult = player.gameResults[delta.round];
      player.gameResults[delta.round] = delta.result;
      console.log('[SERVER_BATCH] Stored P' + delta.playerRank + ' R' + delta.round + ': "' + oldResult + '" -> "' + delta.result + '"');
      ladderData.players[playerIndex] = player;
      results.push({ playerRank: delta.playerRank, round: delta.round, success: true });
    }

    await withTiming(`writeLadderFile(batch-${deltas.length})`, () => writeLadderFile(ladderData));

    broadcastSSEEvent('deltasSubmitted', { type: 'batchUpdate', count: deltas.length });

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

// Check which mini-game files have data (public read-only endpoint)
router.get('/mini-games/check', async (_req: Request, res: Response): Promise<void> => {
  try {
    const filesWith = await checkMiniGameFilesWith();
    res.json({
      success: true,
      data: { files: filesWith },
    });
  } catch (error) {
    logError('[SERVER]', 'Error checking mini-game files:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to check mini-game files' },
    });
  }
});

// Read mini-game file (public read-only endpoint)
router.get('/mini-games/read', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileName } = req.query;

    if (!fileName || !MINI_GAME_FILES.includes(fileName as string)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid mini-game file name' },
      });
      return;
    }

    const miniGameData = await readMiniGameFile(fileName as string);
    if (!miniGameData) {
      res.json({
        success: true,
        data: {
          header: [],
          players: [],
          playerCount: 0,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        header: miniGameData.header,
        players: miniGameData.players,
        playerCount: miniGameData.players.length,
      },
    });
  } catch (error) {
    logError('[SERVER]', 'Error reading mini-game file:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to read mini-game file' },
    });
  }
});

// Write mini-game file (user+admin can write, admin-only operations like copy-players remain in admin.routes)
router.post('/mini-games/write', requireUserKey, writeLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileName, players } = req.body;

    if (!fileName || !MINI_GAME_FILES.includes(fileName)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid mini-game file name' },
      });
      return;
    }

    if (!players || !Array.isArray(players)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid players data' },
      });
      return;
    }

    const result = await writeMiniGameFile(fileName, {
      header: [],
      players,
      rawLines: [],
    });

    if (result.identityUpdates.length > 0) {
      broadcastSSEEvent('ladderUpdated', { type: 'bulkUpdate', count: result.identityUpdates.length, identityMerge: true });
    }
    broadcastSSEEvent('miniGameWritten', { fileName, type: 'miniGameWrite' });

    res.json({
      success: true,
      data: { message: `Saved ${fileName}` },
    });
  } catch (error) {
    logError('[SERVER]', 'Error writing mini-game file:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to write mini-game file' },
    });
  }
});

export { router };
