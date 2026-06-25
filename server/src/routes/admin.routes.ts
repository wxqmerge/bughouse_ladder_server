import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import archiver from 'archiver';
import { requireAdminKey } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { AppError } from '../middleware/errorHandler.js';
import { readLadderFile, writeLadderFile, ensureDataDirectory, generateTabContent, createBackup, rotateBackups, withTiming, getBackupList, restoreBackup, previewBackup, deleteBackup } from '../services/dataService.js';
import { DEFAULT_GAME_RESULTS } from '../../../shared/types/index.js';
import { log, logError } from '../utils/logger.js';
import { broadcastSSEEvent } from '../services/sseService.js';
import { isTrophyReport, isValidLadderHeader } from '../../../shared/utils/trophyFileGuard.js';

import {
  readMiniGameFile,
  readMiniGameFileRaw,
  writeMiniGameFile,
  mergeGameResults,
  exportTournamentFiles,
  generateTrophyReport,
  addPlayerToAllMiniGames,
  removePlayerFromAll,
  updatePlayerInAll,
  checkMiniGameFilesWith,
  tournamentStore,
  MINI_GAME_FILES,
  ZipEntry,
} from '../services/tournamentService.js';
import { buildTrophyReportString } from '../../../shared/utils/trophyDebugReport.js';
import { buildActivityReportData, formatActivityReportTSV } from '../../../shared/utils/activityReport.js';

const router = Router();

/** Normalize a mini-game file name to lowercase and validate against allowed list. */
function normalizeFileName(input: string | undefined | null): string | null {
  if (!input) return null;
  const lower = String(input).toLowerCase();
  return MINI_GAME_FILES.includes(lower) ? lower : null;
}

// All admin routes require admin API key (if configured)
router.use(requireAdminKey);

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype === 'text/tab-separated-values' || ext === '.tab' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('Only .tab or .xls files are allowed'));
    }
  },
});

// Upload .tab or .xls file
router.post('/upload', upload.single('file'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    await withTiming('ensureDataDirectory', ensureDataDirectory);
    
    // Read uploaded file
    const content = await withTiming(`readFile(${req.file!.filename})`, () => fs.readFile(req.file!.path, 'utf-8'));
    
    // Parse and validate
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      await withTiming('unlink(empty)', () => fs.unlink(req.file!.path));
      throw new AppError('Empty file', 400);
    }

    // Guard: reject trophy report files uploaded as ladder data
    if (isTrophyReport(content)) {
      await withTiming('unlink(trophy)', () => fs.unlink(req.file!.path));
      throw new AppError('Trophy report file detected. Trophy reports cannot be uploaded as ladder data.', 400);
    }

    if (!isValidLadderHeader(content)) {
      const allowOverride = req.body?.override === 'true' || req.query?.override === 'true';
      if (!allowOverride) {
        await withTiming('unlink(header)', () => fs.unlink(req.file!.path));
        res.status(400).json({
          success: false,
          error: { message: 'File does not start with "Group" header. Not a valid ladder file. Retry with ?override=true to force.' },
          needsOverride: true,
        });
        return;
      }
    }

    // Create backup before overwriting (skip during tests)
    if (!process.env.VITEST) {
      const backupPath = await createBackup();
      if (backupPath) {
        await rotateBackups();
      }
    }

    // Write to ladder file
    const ladderPath = process.env.TAB_FILE_PATH || path.join(__dirname, '../../data/ladder.tab');
    await withTiming(`writeFile(${ladderPath})`, () => fs.writeFile(ladderPath, content, 'utf-8'));
    
    // Clean up uploaded file
    await withTiming('unlink(upload)', () => fs.unlink(req.file!.path));

    broadcastSSEEvent('fileUploaded', { lines: lines.length, type: 'fileUpload' });

    res.json({
      success: true,
      data: { message: 'File uploaded successfully', lines: lines.length },
    });
  }
));

// Export ladder data as .tab file
router.get('/export', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const ladderData = await readLadderFile();
    const content = generateTabContent(ladderData);

    res.setHeader('Content-Type', 'text/tab-separated-values');
    res.setHeader('Content-Disposition', `attachment; filename="ladder_${new Date().toISOString().split('T')[0]}.tab"`);
    res.send(content);
  }
));

// List available backups
router.get('/backups', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const ladderName = req.query.ladder as string | undefined;
    console.log('[RESTORE BACKUP] ladderName query:', ladderName);
    const backups = await getBackupList(ladderName);
    console.log('[RESTORE BACKUP] returned backups:', backups.length, backups.map(b => b.filename));
    
    res.json({
      success: true,
      data: {
        count: backups.length,
        maxBackups: 20,
        backups,
      },
    });
  }
));

// Restore from a specific backup
router.post('/backups/restore/:filename', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const filename = req.params.filename;
    
    if (!filename || !filename.endsWith('.tab')) {
      throw new AppError('Invalid backup filename', 400);
    }

    const restored = await restoreBackup(filename);
    
    if (restored) {
      broadcastSSEEvent('backupRestored', { filename, type: 'backupRestore' });
      res.json({
        success: true,
        data: {
          message: `Restored from backup: ${filename}`,
          filename,
        },
      });
    } else {
      throw new AppError(`Backup not found: ${filename}`, 404);
    }
  }
));

// Preview backup contents without restoring
router.get('/backups/preview/:filename', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const filename = req.params.filename;

    if (!filename || !filename.endsWith('.tab')) {
      throw new AppError('Invalid backup filename', 400);
    }

    const content = await previewBackup(filename);

    if (content) {
      res.json({
        success: true,
        data: { content, filename },
      });
    } else {
      throw new AppError(`Backup not found: ${filename}`, 404);
    }
  }
));

// Delete a specific backup
router.delete('/backups/:filename', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const filename = req.params.filename;
    
    if (!filename || !filename.endsWith('.tab')) {
      throw new AppError('Invalid backup filename', 400);
    }

    const deleted = await deleteBackup(filename);
    
    if (deleted) {
      res.json({
        success: true,
        data: { message: `Deleted backup: ${filename}` },
      });
    } else {
      throw new AppError(`Backup not found: ${filename}`, 404);
    }
  }
));

// ── Tournament Endpoints ─────────────────────────────────────────

// Save mini-game file (called on New-Day during tournament mode)
router.post('/tournament/save-mini-game', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { fileName } = req.body;
    const normFileName = normalizeFileName(fileName);
    
    if (!normFileName) {
      throw new AppError('Invalid mini-game file name', 400);
    }

    // Read current ladder data
    const ladderData = await readLadderFile();
    
    // Check if file already exists
    const existingFile = await readMiniGameFileRaw(normFileName);
    
    if (existingFile) {
      // Merge game results
      const mergedPlayers = ladderData.players.map(player => {
        const existingPlayer = existingFile.players.find(
          p => p.lastName.toLowerCase() === player.lastName.toLowerCase() &&
               p.firstName.toLowerCase() === player.firstName.toLowerCase()
        );
        
        if (existingPlayer) {
          // Merge game results
          const mergedResults = mergeGameResults(
            existingPlayer.gameResults,
            player.gameResults
          );
          
          return {
            ...player,
            gameResults: mergedResults,
          };
        }
        
        return player;
      });
      
      ladderData.players = mergedPlayers;
    }
    
    // Write mini-game file
    await writeMiniGameFile(normFileName, ladderData);
    
    broadcastSSEEvent('miniGameSaved', { fileName: normFileName, type: 'miniGameSave' });
    
    res.json({
      success: true,
      data: { message: `Saved ${normFileName}` },
    });
  }
));

// Read mini-game file (for tournament mode - ladder form reads from mini-game file)
router.get('/tournament/read-mini-game', asyncHandler(async (req: Request, res: Response): Promise<void> => {
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
  }
));

// Write mini-game file (for tournament mode - ladder form writes to mini-game file)
router.post('/tournament/write-mini-game', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { fileName, players } = req.body;
    const normFileName = normalizeFileName(fileName);
    
    if (!normFileName) {
      throw new AppError('Invalid mini-game file name', 400);
    }

    if (!players || !Array.isArray(players)) {
      throw new AppError('Invalid players data', 400);
    }

    await writeMiniGameFile(normFileName, {
      header: [],
      players,
      rawLines: [],
    });

    broadcastSSEEvent('miniGameWritten', { fileName: normFileName, type: 'miniGameWrite' });

    res.json({
      success: true,
      data: { message: `Saved ${normFileName}` },
    });
  }
));

// Copy players to new mini-game file
router.post('/tournament/copy-players', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { fileName } = req.body;
    const normFileName = normalizeFileName(fileName);
    
    if (!normFileName) {
      throw new AppError('Invalid mini-game file name', 400);
    }

    // Read current ladder data
    const ladderData = await readLadderFile();
    
    // Always copy players with fresh results (mini-games are separate ladders)
    const targetPlayers = ladderData.players.map(player => ({
      ...player,
      gameResults: [...DEFAULT_GAME_RESULTS],
      num_games: 0,
    }));
    
    // Write mini-game file
    await writeMiniGameFile(normFileName, {
      header: [],
      players: targetPlayers,
      rawLines: [],
    });
    
    broadcastSSEEvent('playersCopied', { fileName, type: 'playersCopy' });
    
    res.json({
      success: true,
      data: { message: `Copied players to ${fileName}` },
    });
  }
));

// Export tournament files
router.get('/tournament/export', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const result = await exportTournamentFiles();
    
    if (!result.success) {
      throw new AppError(result.message, 404);
    }

    // Generate trophy report and add to zip
    const trophyResult = await generateTrophyReport(3);
    if (trophyResult.success && trophyResult.trophiesSection) {
      const dateStr = new Date().toISOString().split('T')[0];
      const trophyFileName = `trophies_${dateStr}.tab`;
      const headerLines = trophyResult.debugInfo ? trophyResult.debugInfo.split('\n') : [];
      const tabContent = buildTrophyReportString(headerLines, [], trophyResult.trophiesSection);
      result.files!.push({ name: trophyFileName, content: tabContent });
    }

    // Create ZIP file
    const zipBuffer = await createZipBuffer(result.files!);
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="tournament_${new Date().toISOString().split('T')[0]}.zip"`);
    res.send(zipBuffer);
  }
));

// Generate trophy report
router.get('/tournament/trophies', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const debugLevel = parseInt(req.query.debugLevel as string, 10) || 3;
    const result = await generateTrophyReport(debugLevel);
    
    if (!result.success) {
      throw new AppError(result.message, 404);
    }

    // Save trophy file to server
    const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data'));
    const dateStr = new Date().toISOString().split('T')[0];
    const env = (process.env.NODE_ENV || 'development').replace(/[^a-z0-9-]/g, '');
    const prefix = `${env}-ladder`;
    const trophyFileName = `${prefix}-trophies_${dateStr}.tab`;
    const trophyFilePath = path.join(dataDir, trophyFileName);
    const headerLines = result.debugInfo ? result.debugInfo.split('\n') : [];
    const tabContent = buildTrophyReportString(headerLines, [], result.trophiesSection || []);
    await fs.writeFile(trophyFilePath, tabContent, 'utf-8');
    log('[ADMIN]', `Trophy report saved: ${trophyFileName}`);
    
    res.setHeader('Content-Type', 'text/tab-separated-values');
    res.setHeader('Content-Disposition', `attachment; filename="${trophyFileName}"`);
    res.send(tabContent);
  }
));

// Import single .tab file into a mini-game slot
router.post('/tournament/import-single', upload.single('file'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    const { targetGame } = req.body;
    const normTargetGame = normalizeFileName(targetGame);
    if (!normTargetGame) {
      await withTiming('unlink(bad-target)', () => fs.unlink(req.file!.path));
      throw new AppError(`Invalid target mini-game. Must be one of: ${MINI_GAME_FILES.join(', ')}`, 400);
    }

    await withTiming('ensureDataDirectory', ensureDataDirectory);

    const content = await withTiming(`readFile(${req.file!.filename})`, () => fs.readFile(req.file!.path, 'utf-8'));

    // Guard: reject trophy report files
    if (isTrophyReport(content)) {
      await withTiming('unlink(trophy)', () => fs.unlink(req.file!.path));
      throw new AppError('Trophy report file detected. Trophy reports cannot be imported as mini-game data.', 400);
    }

    if (!isValidLadderHeader(content)) {
      const allowOverride = req.body?.override === 'true';
      if (!allowOverride) {
        await withTiming('unlink(header)', () => fs.unlink(req.file!.path));
        throw new AppError('File does not start with "Group" header. Not a valid ladder file. Retry with override=true to force.', 400);
      }
    }

    const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data/ladder.tab'));
    const filePath = path.join(dataDir, normTargetGame);
    await withTiming(`writeFile(${filePath})`, () => fs.writeFile(filePath, content + '\n', 'utf-8'));

    // Clean up uploaded file
    await withTiming('unlink(upload)', () => fs.unlink(req.file!.path));

    broadcastSSEEvent('miniGameImported', { fileName: normTargetGame, type: 'miniGameImport' });

    res.json({
      success: true,
      data: { message: `Imported to ${normTargetGame}`, fileName: normTargetGame },
    });
  }
));

// Import mini-game files
router.post('/tournament/import', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { content } = req.body;
    
    if (!content || typeof content !== 'string') {
      throw new AppError('Missing content', 400);
    }
    
    const result = await tournamentStore.importMiniGameFiles(content);
    
    broadcastSSEEvent('miniGamesImported', { imported: result.imported, type: 'miniGamesImport' });
    
    res.json({
      success: true,
      data: result,
    });
  }
));

// Clear all mini-game files
router.post('/tournament/clear-mini-games', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data'));
    let deletedCount = 0;
    
    for (const fileName of MINI_GAME_FILES) {
      const filePath = path.join(dataDir, fileName);
      try {
        await fs.unlink(filePath);
        deletedCount++;
        log('[ADMIN]', `Deleted mini-game file: ${fileName}`);
      } catch {
        // File doesn't exist, skip
      }
    }
    
    broadcastSSEEvent('miniGamesCleared', { deletedCount, type: 'miniGamesClear' });

    res.json({
      success: true,
      data: { message: `Cleared ${deletedCount} mini-game files`, deletedCount },
    });
  }
));

// Add player to all mini-game files
router.post('/tournament/add-player-to-mini-games', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { player } = req.body;
    
    if (!player) {
      throw new AppError('Player data required', 400);
    }
    
    await addPlayerToAllMiniGames(player);
    
    broadcastSSEEvent('playerAdded', { type: 'playerAddToMiniGames' });
    
    res.json({
      success: true,
      data: { message: 'Player added to all mini-game files' },
    });
  }
));

// Remove player from club ladder + all mini-game files
router.post('/tournament/remove-player-from-all', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { lastName, firstName } = req.body;

    if (!lastName || !firstName) {
      throw new AppError('lastName and firstName required', 400);
    }

    await removePlayerFromAll(lastName, firstName);

    broadcastSSEEvent('playerRemoved', { type: 'playerRemovedFromAll', lastName, firstName });

    res.json({
      success: true,
      data: { message: 'Player removed from all files' },
    });
  }
));

// Update player info across club ladder + all mini-game files
router.put('/tournament/update-player-in-all', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { rank, originalLastName, originalFirstName, updates } = req.body;

    if (rank === null || rank === undefined || !originalLastName || !originalFirstName || !updates) {
      throw new AppError('rank, originalLastName, originalFirstName, and updates required', 400);
    }

    await updatePlayerInAll(rank, originalLastName, originalFirstName, updates);

    broadcastSSEEvent('playerUpdated', { type: 'playerUpdatedInAll', rank, originalLastName, originalFirstName, updates });

    res.json({
      success: true,
      data: { message: 'Player updated in all files' },
    });
  }
));

// Check which mini-game files have data
router.get('/tournament/check-mini-games', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const filesWith = await checkMiniGameFilesWith();
    
    res.json({
      success: true,
      data: { files: filesWith },
    });
  }
));

// Helper function to create ZIP buffer
async function createZipBuffer(files: ZipEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    
    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', (err) => reject(err));
    
    for (const entry of files) {
      if (entry.content) {
        archive.append(entry.content, { name: entry.name });
      } else if (entry.filePath) {
        archive.file(entry.filePath, { name: entry.name });
      }
    }
    
    archive.finalize();
  });
}

// Generate activity report: Rank, Last Name, First Name, Club Games, Mini Total
router.get('/activity-report', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const ladderData = await readLadderFile();
    const clubPlayers = ladderData.players || [];

    // Collect mini-game players from disk
    const miniGameFilePlayers = new Map<string, import('../services/dataService.js').PlayerData[]>();
    for (const miniFile of MINI_GAME_FILES) {
      try {
        const miniData = await readMiniGameFile(miniFile);
        if (miniData && miniData.players) {
          miniGameFilePlayers.set(miniFile, miniData.players);
        }
      } catch {
        // File doesn't exist, skip
      }
    }

    const reportData = buildActivityReportData(clubPlayers, miniGameFilePlayers);
    const content = formatActivityReportTSV(clubPlayers, reportData);
    const dateStr = new Date().toISOString().split('T')[0];
    const blob = Buffer.from(content, 'utf-8');

    res.setHeader('Content-Type', 'text/tab-separated-values');
    res.setHeader('Content-Disposition', `attachment; filename=activity_${dateStr}.tab`);
    res.send(blob);
  }
));

// Clear all game results, keep player data intact
router.post('/clear-results', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const ladderData = await readLadderFile();
    const cleared = ladderData.players.length;
    for (const player of ladderData.players) {
      player.gameResults = [...DEFAULT_GAME_RESULTS];
    }
    await writeLadderFile(ladderData);
    broadcastSSEEvent('resultsCleared', { type: 'clearResults', count: cleared });
    res.json({
      success: true,
      data: { message: `Cleared results for ${cleared} players`, cleared },
    });
  }
));

// Export all data TAB files (ladder + mini-games) into a zip
router.get('/export-mini-data', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data'));
    const files: ZipEntry[] = [{ name: 'ladder.tab', filePath: path.join(dataDir, 'ladder.tab') }];
    
    for (const miniGameFile of MINI_GAME_FILES) {
      const filePath = path.join(dataDir, miniGameFile);
      try {
        await fs.access(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        if (content.trim().split('\n').length > 1) {
          files.push({ name: miniGameFile, filePath });
        }
      } catch {
        // File doesn't exist or is empty, skip
      }
    }
    
    const zipBuffer = await createZipBuffer(files);
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=mini_data_${new Date().toISOString().split('T')[0]}.zip`);
    res.send(zipBuffer);
  }
));

export { router };
