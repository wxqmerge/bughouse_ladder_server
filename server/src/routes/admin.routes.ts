import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { authenticate, AuthRequest, requireAdmin } from '../middleware/auth.middleware';
import { readLadderFile, writeLadderFile, ensureDataDirectory } from '../services/dataService';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate, requireAdmin);

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/tab-separated-values' || path.extname(file.originalname) === '.tab') {
      cb(null, true);
    } else {
      cb(new Error('Only .tab files are allowed'));
    }
  },
});

// Upload .tab file
router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: { message: 'No file uploaded' },
      });
      return;
    }

    await ensureDataDirectory();
    
    // Read uploaded file
    const content = await fs.readFile(req.file.path, 'utf-8');
    
    // Parse and validate
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      await fs.unlink(req.file.path);
      res.status(400).json({
        success: false,
        error: { message: 'Empty file' },
      });
      return;
    }

    // Write to ladder file
    const ladderPath = process.env.TAB_FILE_PATH || path.join(__dirname, '../../../data/ladder.tab');
    await fs.writeFile(ladderPath, content, 'utf-8');
    
    // Clean up uploaded file
    await fs.unlink(req.file.path);

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
    
    // Reconstruct .tab content
    const headerLine = ladderData.header.join('\t');
    
    const playerLines = ladderData.players.map(player => {
      const baseFields = [
        player.group,
        player.lastName,
        player.firstName,
        player.rating.toString(),
        '', // ranking
        player.nRating.toString(),
        player.grade,
        player.num_games.toString(),
        player.attendance.toString(),
        player.phone,
        player.info,
        player.school,
        player.room,
      ];
      
      const gameResults = (player.gameResults || []).slice(0, 31);
      while (gameResults.length < 31) {
        gameResults.push('');
      }
      
      return [...baseFields, ...gameResults].join('\t');
    });

    const content = [headerLine, ...playerLines].join('\n') + '\n';

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

// Get server statistics
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const ladderData = await readLadderFile();
    
    const stats = {
      totalPlayers: ladderData.players.length,
      totalGames: ladderData.players.reduce((sum, p) => 
        sum + (p.gameResults || []).filter(r => r && r !== '_').length, 0
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

export { router };
