import 'dotenv/config';
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import routes
import { router as authRouter } from './routes/auth.routes';
import { router as ladderRouter } from './routes/ladder.routes';
import { router as gameRouter } from './routes/game.routes';
import { router as adminRouter } from './routes/admin.routes';
import { errorHandler } from './middleware/errorHandler';
import { initializeDefaultLadder } from './services/dataService';

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for proper IP handling behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for development
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Parse JSON and URL-encoded bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/ladder', ladderRouter);
app.use('/api/games', gameRouter);
app.use('/api/admin', adminRouter);

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../dist')));
  
  // Catch all routes for React Router
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../../dist/index.html'));
  });
}

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
  try {
    await initializeDefaultLadder();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ES module equivalent of !module.parent
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}

export default app;
