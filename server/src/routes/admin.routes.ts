import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import archiver from 'archiver';
import { requireAdminKey } from '../middleware/auth.middleware.js';
import { readLadderFile, writeLadderFile, ensureDataDirectory, PlayerData, generateTabContent, createBackup, rotateBackups, withTiming, getBackupList, restoreBackup, deleteBackup } from '../services/dataService.js';
import { log } from '../utils/logger.js';
import { getSlowOperations, clearSlowOperations, generatePerformanceReport } from '../utils/performance.js';
import {
  loadTournamentState,
  startTournament,
  endTournament,
  getTournamentState,
  isTournamentActive,
  getMiniGameFilePath,
  readMiniGameFile,
  writeMiniGameFile,
  copyPlayersToTarget,
  mergeGameResults,
  getExistingMiniGameFiles,
  hasMiniGameFiles,
  exportTournamentFiles,
  generateTrophyReport,
  MINI_GAME_FILES,
  MINI_GAME_DIFFICULTY_ORDER,
} from '../services/tournamentService.js';

const router = Router();

// All admin routes require admin API key (if configured)
router.use(requireAdminKey);

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.mimetype === 'text/tab-separated-values' || ext === '.tab' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('Only .tab or .xls files are allowed'));
    }
  },
});

// Upload .tab or .xls file
router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: { message: 'No file uploaded' },
      });
      return;
    }

    await withTiming('ensureDataDirectory', ensureDataDirectory);
    
    // Read uploaded file
    const content = await withTiming(`readFile(${req.file!.filename})`, () => fs.readFile(req.file!.path, 'utf-8'));
    
    // Parse and validate
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      await withTiming('unlink(empty)', () => fs.unlink(req.file!.path));
      res.status(400).json({
        success: false,
        error: { message: 'Empty file' },
      });
      return;
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

    res.json({
      success: true,
      data: { message: 'File uploaded successfully', lines: lines.length },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to upload file' },
    });
  }
});

// Export ladder data as .tab file
router.get('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const ladderData = await readLadderFile();
    const content = generateTabContent(ladderData);

    res.setHeader('Content-Type', 'text/tab-separated-values');
    res.setHeader('Content-Disposition', `attachment; filename="ladder_${new Date().toISOString().split('T')[0]}.tab"`);
    res.send(content);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to export data' },
    });
  }
});

// Process game results and calculate ratings
router.post('/process', async (req: Request, res: Response): Promise<void> => {
  try {
    const ladderData = await readLadderFile();
    
    // Import processing functions from shared
    // This will be properly configured when we set up the shared module
    console.log('Processing game results...');
    
    // Placeholder response
    res.json({
      success: true,
      data: {
        message: 'Processing completed',
        playerCount: ladderData.players.length,
      },
    });
  } catch (error) {
    console.error('Process error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to process game results' },
    });
  }
});

// Regenerate ladder.tab file from current data
router.post('/regenerate', async (req: Request, res: Response): Promise<void> => {
  try {
    const ladderData = await withTiming('readLadderFile(regenerate)', readLadderFile);
    const content = generateTabContent(ladderData);
    
    // Create backup before overwriting (skip during tests)
    if (!process.env.VITEST) {
      const backupPath = await createBackup();
      if (backupPath) {
        await rotateBackups();
      }
    }

    const ladderPath = process.env.TAB_FILE_PATH || path.join(__dirname, '../../data/ladder.tab');
    await withTiming(`writeFile(regenerate)`, () => fs.writeFile(ladderPath, content, 'utf-8'));

    res.json({
      success: true,
      data: {
        message: 'Ladder file regenerated successfully',
        players: ladderData.players.length,
        path: ladderPath,
      },
    });
  } catch (error) {
    console.error('Regenerate error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to regenerate ladder file' },
    });
  }
});

// Get server statistics
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const ladderData = await readLadderFile();
    
    const stats = {
      totalPlayers: ladderData.players.length,
      totalGames: ladderData.players.reduce((sum: number, p: PlayerData) => 
        sum + (p.gameResults || []).filter((r: string | null) => r && r !== '_').length, 0
      ),
      lastModified: new Date().toISOString(),
    };

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get statistics' },
    });
  }
});

// Get performance report (slow operations)
router.get('/performance', async (req: Request, res: Response): Promise<void> => {
  try {
    const report = generatePerformanceReport();
    
    res.json({
      success: true,
      data: {
        report,
        operations: getSlowOperations(),
      },
    });
  } catch (error) {
    console.error('Performance report error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get performance report' },
    });
  }
});

// Clear performance data
router.post('/performance/clear', async (req: Request, res: Response): Promise<void> => {
  try {
    clearSlowOperations();
    
    res.json({
      success: true,
      data: { message: 'Performance data cleared' },
    });
  } catch (error) {
    console.error('Clear performance error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to clear performance data' },
    });
  }
});

// Preview a specific backup file content
router.get('/backups/preview/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const filename = req.params.filename;
    
    if (!filename || !filename.endsWith('.tab')) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid backup filename' },
      });
      return;
    }

    const dataDir = path.join(__dirname, '../../data');
    const filePath = path.join(dataDir, 'backups', filename);
    
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({
      success: true,
      data: { content },
    });
  } catch (error) {
    console.error('Preview backup error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to read backup file' },
    });
  }
});

// List available backups
router.get('/backups', async (req: Request, res: Response): Promise<void> => {
  try {
    const backups = await getBackupList();
    
    res.json({
      success: true,
      data: {
        count: backups.length,
        maxBackups: 20,
        backups,
      },
    });
  } catch (error) {
    console.error('Backups list error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to list backups' },
    });
  }
});

// Restore from a specific backup
router.post('/backups/restore/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const filename = req.params.filename;
    
    if (!filename || !filename.endsWith('.tab')) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid backup filename' },
      });
      return;
    }

    const restored = await restoreBackup(filename);
    
    if (restored) {
      res.json({
        success: true,
        data: {
          message: `Restored from backup: ${filename}`,
          filename,
        },
      });
    } else {
      res.status(404).json({
        success: false,
        error: { message: `Backup not found: ${filename}` },
      });
    }
  } catch (error) {
    console.error('Restore backup error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to restore backup' },
    });
  }
});

// Delete a specific backup
router.delete('/backups/:filename', async (req: Request, res: Response): Promise<void> => {
  try {
    const filename = req.params.filename;
    
    if (!filename || !filename.endsWith('.tab')) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid backup filename' },
      });
      return;
    }

    const deleted = await deleteBackup(filename);
    
    if (deleted) {
      res.json({
        success: true,
        data: { message: `Deleted backup: ${filename}` },
      });
    } else {
      res.status(404).json({
        success: false,
        error: { message: `Backup not found: ${filename}` },
      });
    }
  } catch (error) {
    console.error('Delete backup error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to delete backup' },
    });
  }
});

// ── Tournament Endpoints ─────────────────────────────────────────

// Get tournament state
router.get('/tournament/status', async (req: Request, res: Response): Promise<void> => {
  try {
    await loadTournamentState();
    const state = getTournamentState();
    
    res.json({
      success: true,
      data: state,
    });
  } catch (error) {
    console.error('Tournament status error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to get tournament status' },
    });
  }
});

// Start tournament
router.post('/tournament/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const state = await startTournament();
    
    res.json({
      success: true,
      data: state,
    });
  } catch (error) {
    console.error('Start tournament error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to start tournament' },
    });
  }
});

// End tournament
router.post('/tournament/end', async (req: Request, res: Response): Promise<void> => {
  try {
    await endTournament();
    
    res.json({
      success: true,
      data: { message: 'Tournament ended' },
    });
  } catch (error) {
    console.error('End tournament error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to end tournament' },
    });
  }
});

// Save mini-game file (called on New-Day during tournament mode)
router.post('/tournament/save-mini-game', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileName } = req.body;
    
    if (!fileName || !MINI_GAME_FILES.includes(fileName)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid mini-game file name' },
      });
      return;
    }

    // Read current ladder data
    const ladderData = await readLadderFile();
    
    // Check if file already exists
    const existingFile = await readMiniGameFile(fileName);
    
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
    await writeMiniGameFile(fileName, ladderData);
    
    res.json({
      success: true,
      data: { message: `Saved ${fileName}` },
    });
  } catch (error) {
    console.error('Save mini-game error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to save mini-game file' },
    });
  }
});

// Copy players to new mini-game file
router.post('/tournament/copy-players', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileName } = req.body;
    
    if (!fileName || !MINI_GAME_FILES.includes(fileName)) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid mini-game file name' },
      });
      return;
    }

    // Read current ladder data
    const ladderData = await readLadderFile();
    
    // Check if file already exists
    const existingFile = await readMiniGameFile(fileName);
    
    let targetPlayers: PlayerData[];
    
    if (existingFile) {
      // Copy players from current ladder to existing file
      targetPlayers = copyPlayersToTarget(ladderData.players, existingFile.players);
    } else {
      // Create new file with current ladder players
      targetPlayers = ladderData.players.map(player => ({
        ...player,
        gameResults: Array(31).fill(null),
        num_games: 0,
      }));
    }
    
    // Write mini-game file
    await writeMiniGameFile(fileName, {
      header: [],
      players: targetPlayers,
      rawLines: [],
    });
    
    res.json({
      success: true,
      data: { message: `Copied players to ${fileName}` },
    });
  } catch (error) {
    console.error('Copy players error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to copy players' },
    });
  }
});

// Export tournament files
router.get('/tournament/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await exportTournamentFiles();
    
    if (!result.success) {
      res.status(404).json({
        success: false,
        error: { message: result.message },
      });
      return;
    }

    // Create ZIP file
    const zipBuffer = await createZipBuffer(result.files!);
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="tournament_${new Date().toISOString().split('T')[0]}.zip"`);
    res.send(zipBuffer);
  } catch (error) {
    console.error('Export tournament error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to export tournament files' },
    });
  }
});

// Generate trophy report
router.get('/tournament/trophies', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await generateTrophyReport();
    
    if (!result.success) {
      res.status(404).json({
        success: false,
        error: { message: result.message },
      });
      return;
    }

    // Save trophy file to server
    const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data'));
    const trophyFileName = `tournament_trophies_${new Date().toISOString().split('T')[0]}.tab`;
    const trophyFilePath = path.join(dataDir, trophyFileName);
    const tabContent = generateTrophyTabContent(result.trophies!, result.isClubMode);
    await fs.writeFile(trophyFilePath, tabContent, 'utf-8');
    log('[ADMIN]', `Trophy report saved: ${trophyFileName}`);
    
    res.setHeader('Content-Type', 'text/tab-separated-values');
    res.setHeader('Content-Disposition', `attachment; filename="tournament_trophies_${new Date().toISOString().split('T')[0]}.tab"`);
    res.send(tabContent);
  } catch (error) {
    console.error('Generate trophies error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to generate trophy report' },
    });
  }
});

// Clear all mini-game files
router.post('/tournament/clear-mini-games', async (req: Request, res: Response): Promise<void> => {
  try {
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
    
    res.json({
      success: true,
      data: { message: `Cleared ${deletedCount} mini-game files`, deletedCount },
    });
  } catch (error) {
    console.error('Clear mini-games error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to clear mini-game files' },
    });
  }
});

// Helper function to create ZIP buffer
async function createZipBuffer(files: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    
    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', (err) => reject(err));
    
    const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data'));
    
    for (const file of files) {
      const filePath = path.join(dataDir, file);
      archive.file(filePath, { name: file });
    }
    
    archive.finalize();
  });
}

// Export all data TAB files (ladder + mini-games) into a zip
router.get('/export-mini-data', async (req: Request, res: Response): Promise<void> => {
  try {
    const dataDir = path.dirname(process.env.TAB_FILE_PATH || path.join(__dirname, '../../data'));
    const files = ['ladder.tab'];
    
    for (const miniGameFile of MINI_GAME_FILES) {
      const filePath = path.join(dataDir, miniGameFile);
      try {
        await fs.access(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        if (content.trim().split('\n').length > 1) {
          files.push(miniGameFile);
        }
      } catch {
        // File doesn't exist or is empty, skip
      }
    }
    
    const zipBuffer = await createZipFromFiles(files);
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=mini_data_${new Date().toISOString().split('T')[0]}.zip`);
    res.send(zipBuffer);
  } catch (error) {
    console.error('Export mini data error:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to export mini data' },
    });
  }
});

// Helper function to generate trophy TAB content
function generateTrophyTabContent(trophies: any[], isClubMode: boolean = false): string {
  const header = 'Rank\tPlayer\tGr\tTrophy Type\tMini-Game/Grade\tGames Played';
  const lines = [header];
  
  for (const trophy of trophies) {
    lines.push(`${trophy.rank}\t${trophy.player}\t${trophy.gr}\t${trophy.trophyType}\t${trophy.miniGameOrGrade}\t${trophy.gamesPlayed}`);
  }
  
  return lines.join('\n') + '\n';
}

export { router };
