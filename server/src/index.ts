import dotenv from 'dotenv';

// Load environment variables from multiple possible locations
dotenv.config({ path: '.env' });
dotenv.config({ path: '../.env' });

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
import { router as authRouter } from './routes/auth.routes.js';
import { router as ladderRouter } from './routes/ladder.routes.js';
import { router as gameRouter } from './routes/game.routes.js';
import { router as adminRouter } from './routes/admin.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initializeDefaultLadder } from './services/dataService.js';
import { generatePerformanceReport, clearSlowOperations } from './utils/performance.js';

const app: Application = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for proper IP handling behind reverse proxy
app.set('trust proxy', 1);

// Log all API requests with timing for slow requests (>500ms)
app.use('/api/*', (req, res, next) => {
  const startTime = Date.now();
  const requestInfo = `${req.method} ${req.path}`;
  console.log(`[API] ${requestInfo}`);
  
  // Hook into response finish to log duration
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any, callback?: any) {
    const duration = Date.now() - startTime;
    if (duration > 500) {
      console.log(`\n[SLOW REQUEST] ${requestInfo} took ${duration}ms`);
      console.log(`[SLOW REQUEST] Query params:`, req.query);
      console.log(`[SLOW REQUEST] Headers:`, { 
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent']?.substring(0, 100)
      });
      // Capture call stack to identify slow endpoint
      const stack = new Error().stack;
      if (stack) {
        console.log(`[SLOW REQUEST] Stack trace:`);
        console.log(stack.split('\n').slice(0, 10).join('\n'));
      }
    }
    return originalEnd.call(res, chunk, encoding, callback);
  };
  
  next();
});

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
      console.log(`✓ CORS Origin: ${process.env.CORS_ORIGIN || '*'}`);
      console.log(`✓ Admin API Key: ${process.env.ADMIN_API_KEY ? 'Enabled (protected)' : 'Disabled (local mode)'}`);
      console.log('');
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('⚠️  DEVELOPMENT MODE');
        if (process.env.ADMIN_API_KEY) {
          console.log(`  - Admin endpoints protected with API key`);
          if (process.env.ADMIN_API_KEY.includes('dev-admin-key')) {
            console.log('  ⚠️  Using DEFAULT admin key - CHANGE IN PRODUCTION!');
          }
        } else {
          console.log('  - Admin endpoints are unprotected');
        }
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
