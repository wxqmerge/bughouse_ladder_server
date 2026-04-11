import dotenv from 'dotenv';

// Load environment variables from multiple possible locations
dotenv.config({ path: '.env' });
dotenv.config({ path: '../.env' });

// Validate required environment variables BEFORE any other imports
function validateEnvironment(): void {
  const errors: string[] = [];
  
  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET - Generate with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  }
  
  if (!process.env.CORS_ORIGIN) {
    errors.push('CORS_ORIGIN - Set to your frontend domain (e.g., http://localhost:5173 or https://your-domain.com)');
  }
  
  if (!process.env.ADMIN_USERNAME) {
    errors.push('ADMIN_USERNAME');
  }
  
  if (!process.env.ADMIN_PASSWORD) {
    errors.push('ADMIN_PASSWORD');
  }
  
  if (errors.length > 0) {
    console.error('\n========================================');
    console.error('  MISSING REQUIRED ENVIRONMENT VARIABLES');
    console.error('=========================================\n');
    errors.forEach(err => console.error(`  ✗ ${err}`));
    console.error('\nPlease set these variables in your .env file and restart the server.\n');
    process.exit(1);
  }
}

validateEnvironment();

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: { message: 'Too many authentication attempts, please try again later' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    success: false,
    error: { message: 'Too many requests, please try again later' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Security middleware with Content Security Policy
const isProduction = process.env.NODE_ENV === 'production';
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", process.env.CORS_ORIGIN ? new URL(process.env.CORS_ORIGIN).origin : "'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  } : false,
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN,
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
      console.log('\n========================================');
      console.log('  BUGHOUSE CHESS LADDER SERVER');
      console.log('========================================\n');
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ CORS Origin: ${process.env.CORS_ORIGIN}`);
      console.log(`✓ Admin Username: ${process.env.ADMIN_USERNAME}`);
      console.log('');
      
      // Security warnings for development defaults
      if (process.env.NODE_ENV !== 'production') {
        console.log('⚠️  DEVELOPMENT MODE - Security Settings:');
        if (process.env.JWT_SECRET?.includes('dev-secret')) {
          console.log('   ⚠️  Using development JWT secret');
        }
        if (process.env.ADMIN_PASSWORD === 'ChangeMe123!' || process.env.ADMIN_PASSWORD === 'admin123') {
          console.log('   ⚠️  Default admin password not changed!');
        }
        console.log('');
      } else {
        console.log('✓ Security Features Enabled:');
        console.log('  - Content Security Policy');
        console.log('  - Rate Limiting');
        console.log('  - CORS Restrictions');
        console.log('');
      }
      
      console.log('========================================\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ES module equivalent of !module.parent
const isMainModule = process.argv[1] && path.basename(process.argv[1]) === 'index.ts';
if (isMainModule) {
  startServer();
}

export default app;
