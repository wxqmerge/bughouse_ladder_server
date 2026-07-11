import { Router, Request, Response } from 'express';
import { requireUserKey } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { writeLimiter } from '../middleware/rateLimit.middleware.js';
import { AppError } from '../middleware/errorHandler.js';
import { readLadderFile, writeLadderFile, PlayerData, withTiming } from '../services/dataService.js';
import { log, logError, shouldLog } from '../utils/logger.js';
import { broadcastSSEEvent } from '../services/sseService.js';
import { checkMiniGameFilesWith, readMiniGameFile, writeMiniGameFile, MINI_GAME_FILES } from '../services/tournamentService.js';
import { deduplicatePlayers } from '../../../shared/utils/dedupUtils.js';
import { NUM_ROUNDS } from '../../../shared/utils/constants.js';
import { DEFAULT_GAME_RESULTS } from '../../../shared/types/index.js';

const router = Router();

/** Normalize a mini-game file name to lowercase and validate against allowed list. */
function normalizeFileName(input: string | undefined | null): string | null {
  if (!input) return null;
  const lower = String(input).toLowerCase();
  return MINI_GAME_FILES.includes(lower) ? lower : null;
}

// Get all ladder data (public read access)
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const ladderData = await readLadderFile();
  res.json({
    success: true,
    data: {
      header: ladderData.header,
      players: ladderData.players,
      playerCount: ladderData.players.length,
    },
  });
}));

// Get single player by rank
router.get('/:rank', asyncHandler(async (req: Request, res: Response) => {
  const rank = parseInt(req.params.rank);
  if (isNaN(rank) || rank < 1) {
    throw new AppError('Invalid rank', 400);
  }

  const ladderData = await readLadderFile();
  const player = ladderData.players.find((p: PlayerData) => p.rank === rank);

  if (!player) {
    throw new AppError('Player not found', 404);
  }

  res.json({
    success: true,
    data: player,
  });
}));

// Update player data (requires user or admin API key)
router.put('/:rank', requireUserKey, writeLimiter, asyncHandler(async (req: Request, res: Response) => {
  const rank = parseInt(req.params.rank);
  if (isNaN(rank) || rank < 1) {
    throw new AppError('Invalid rank', 400);
  }

  const ladderData = await readLadderFile();
  const playerIndex = ladderData.players.findIndex((p: PlayerData) => p.rank === rank);

  if (playerIndex === -1) {
    throw new AppError('Player not found', 404);
  }

  // Update player fields (whitelist-safe)
  const updatedPlayer = { ...ladderData.players[playerIndex] };
  const body = req.body as Record<string, unknown>;
  for (const [key, value] of Object.entries(body)) {
    if (key === 'rank') continue;
    if (key === 'gameResults' && (!Array.isArray(value) || !value.every((v: unknown) => v === null || typeof v === 'string'))) {
      continue;
    }
    (updatedPlayer as Record<string, unknown>)[key] = value;
  }

  ladderData.players[playerIndex] = updatedPlayer;
  await writeLadderFile(ladderData);

  broadcastSSEEvent('playerUpdated', { rank: updatedPlayer.rank, type: 'playerUpdate' });

  res.json({
    success: true,
    data: updatedPlayer,
  });
}));

// Clear a single game result cell (requires user or admin API key)
router.delete('/:rank/round/:roundIndex', requireUserKey, writeLimiter, asyncHandler(async (req: Request, res: Response) => {
  const rank = parseInt(req.params.rank);
  const roundIndex = parseInt(req.params.roundIndex);

  if (isNaN(rank) || rank < 1 || isNaN(roundIndex) || roundIndex < 0 || roundIndex >= NUM_ROUNDS) {
    throw new AppError('Invalid rank or round index', 400);
  }

  const ladderData = await readLadderFile();
  const playerIndex = ladderData.players.findIndex((p: PlayerData) => p.rank === rank);

  if (playerIndex === -1) {
    throw new AppError('Player not found', 404);
  }

  const player = ladderData.players[playerIndex];

  // Clear the cell
  if (!player.gameResults) {
    player.gameResults = [...DEFAULT_GAME_RESULTS];
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
}));

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
router.put('/', requireUserKey, writeLimiter, asyncHandler(async (req: Request, res: Response) => {
  const clientDebugLevel = parseInt(req.headers['x-debug-level'] as string, 10);
  const body = req.body as { players?: unknown };
  const players = body.players;

  if (!players || !Array.isArray(players)) {
    throw new AppError('Invalid players data', 400);
  }

  const invalidIndices = players.map((p, i) => isValidPlayerData(p) ? -1 : i).filter(i => i !== -1);
  if (invalidIndices.length > 0) {
    throw new AppError(`Players at index(es) ${invalidIndices.join(', ')} missing required fields`, 400);
  }

  const typedPlayers = players as PlayerData[];

  // Debug: log ALL game results when debugLevel <= 5
  if (shouldLog(5, isNaN(clientDebugLevel) ? undefined : clientDebugLevel)) {
    log('[SERVER_PUT]', `players=${typedPlayers.length}`);
    for (const p of typedPlayers) {
      if (p.gameResults) {
        for (let r = 0; r < p.gameResults.length; r++) {
          const result = p.gameResults[r];
          if (result) {
            console.log(`[SERVER_PUT] P${p.rank} R${r} = "${result}"`);
          }
        }
      }
    }
  }

  const ladderData: any = await withTiming(`readLadderFile(bulk)`, readLadderFile);

  // Debug: compare incoming data with file data
  if (shouldLog(5, isNaN(clientDebugLevel) ? undefined : clientDebugLevel)) {
    for (const ip of typedPlayers) {
      const fp = ladderData.players?.find((p: PlayerData) => p.rank === ip.rank);
      if (fp && fp.gameResults && ip.gameResults) {
        for (let r = 0; r < 31; r++) {
          const inv = ip.gameResults[r];
          const fvl = fp.gameResults[r];
          if (inv !== fvl) {
            console.log(`[SERVER_PUT] DIFF P${ip.rank} R${r}: incoming="${inv}" file="${fvl}"`);
          }
        }
      }
    }
  }

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
}));

// Batch update game results (requires user or admin API key)
router.post('/batch', requireUserKey, writeLimiter, asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { deltas?: unknown };
  const deltas = body.deltas;

  if (!deltas || !Array.isArray(deltas)) {
    throw new AppError('Invalid deltas data', 400);
  }

  const invalidDeltas = deltas.map((d, i) => isValidDelta(d) ? -1 : i).filter(i => i !== -1);
  if (invalidDeltas.length > 0) {
    throw new AppError(`Deltas at index(es) ${invalidDeltas.join(', ')} missing required fields`, 400);
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
      player.gameResults = [...DEFAULT_GAME_RESULTS];
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
}));

// Check which mini-game files have data (public read-only endpoint)
router.get('/mini-games/check', asyncHandler(async (_req: Request, res: Response) => {
  const filesWith = await checkMiniGameFilesWith();
  res.json({
    success: true,
    data: { files: filesWith },
  });
}));

// Read mini-game file (public read-only endpoint)
router.get('/mini-games/read', asyncHandler(async (req: Request, res: Response) => {
  const { fileName } = req.query;
  const normFileName = normalizeFileName(typeof fileName === 'string' ? fileName : undefined);

  if (!normFileName) {
    throw new AppError('Invalid mini-game file name', 400);
  }

  const miniGameData = await readMiniGameFile(normFileName);
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
}));

// Write mini-game file (user+admin can write, admin-only operations like copy-players remain in admin.routes)
router.post('/mini-games/write', requireUserKey, writeLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { fileName, players } = req.body;
  const normFileName = normalizeFileName(fileName);

  if (!normFileName) {
    throw new AppError('Invalid mini-game file name', 400);
  }

  if (!players || !Array.isArray(players)) {
    throw new AppError('Invalid players data', 400);
  }

  const result = await writeMiniGameFile(normFileName, {
    header: [],
    players,
    rawLines: [],
  });

  if (result.identityUpdates.length > 0) {
    broadcastSSEEvent('ladderUpdated', { type: 'bulkUpdate', count: result.identityUpdates.length, identityMerge: true });
  }
  broadcastSSEEvent('miniGameWritten', { fileName: normFileName, type: 'miniGameWrite' });

  res.json({
    success: true,
    data: { message: `Saved ${normFileName}` },
  });
}));

export { router };
