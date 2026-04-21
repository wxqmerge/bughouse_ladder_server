import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { requireAdminKey } from '../middleware/auth.middleware.js';
import { readLadderFile, writeLadderFile, ensureDataDirectory, PlayerData, generateTabContent, withTiming } from '../services/dataService.js';
import { getSlowOperations, clearSlowOperations, generatePerformanceReport } from '../utils/performance.js';

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

export { router };
