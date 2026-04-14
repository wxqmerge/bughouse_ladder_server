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
const isProduction = process.env.NODE_ENV === 'production';

// Debug: Show environment variables at startup
console.log('Environment variables loaded:');
console.log('  - NODE_ENV:', process.env.NODE_ENV);
console.log('  - PORT:', process.env.PORT);
console.log('  - CORS_ORIGINS:', process.env.CORS_ORIGINS);
console.log('  - ADMIN_API_KEY:', process.env.ADMIN_API_KEY ? 'Set (' + process.env.ADMIN_API_KEY.length + ' chars)' : 'NOT SET');

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

// Rate limiting for authentication endpoints (strict - prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 attempts per window
  message: {
    success: false,
    error: { message: 'Too many authentication attempts. Please try again later.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limiter (moderate - balance usability and protection)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 100 : 1000, // 100 in production, 1000 in dev
  message: {
    success: false,
    error: { message: 'Too many requests. Please slow down.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// Security middleware with Content Security Policy
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
// Get allowed origins from environment variable (comma-separated list)
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(o => o) || ['*'];

console.log('[CORS] Configuration:');
console.log('  - CORS_ORIGINS env var:', process.env.CORS_ORIGINS);
console.log('  - Parsed origins:', corsOrigins);
console.log('  - Using origin setting:', corsOrigins.includes('*') ? '"*" (all origins)' : corsOrigins.join(', '));

// SECURITY WARNING: In production, never use '*' with credentials: true
if (isProduction && corsOrigins.includes('*')) {
  console.warn('⚠️  SECURITY WARNING: CORS Origins set to "*" in production mode!');
  console.warn('⚠️  This allows ANY website to make authenticated requests to your API.');
  console.warn('⚠️  Set CORS_ORIGINS to your actual domain in .env file.');
}

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Fallback CORS headers - ensures headers are always present
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (corsOrigins.includes('*') || corsOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Parse JSON and URL-encoded bodies with size limits
// Limit to 1mb to prevent DoS attacks via large payloads
const requestSizeLimit = process.env.REQUEST_SIZE_LIMIT || '1mb';
app.use(express.json({ limit: requestSizeLimit }));
app.use(express.urlencoded({ extended: true, limit: requestSizeLimit }));

// HTTP Method validation - reject dangerous methods on static routes
app.use((req, res, next) => {
  const dangerousMethods = ['TRACE', 'TRACK', 'CONNECT'];
  if (dangerousMethods.includes(req.method)) {
    console.log(`[SECURITY] Blocked dangerous method: ${req.method} from ${req.ip}`);
    return res.status(405).json({ success: false, error: { message: 'Method not allowed' } });
  }
  next();
});

// Security logging middleware for production
if (isProduction) {
  app.use('/api/*', (req, res, next) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent']?.substring(0, 50) || 'unknown';
    
    // Log suspicious patterns
    if (req.path.includes('..') || req.path.includes('<script')) {
      console.log(`[SECURITY] Suspicious request from ${clientIp}: ${req.method} ${req.path}`);
      console.log(`[SECURITY] User-Agent: ${userAgent}`);
    }
    
    next();
  });
}

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
      console.log(`✓ CORS Origins: ${process.env.CORS_ORIGINS || '*'}`);
      console.log(`✓ Admin API Key: ${process.env.ADMIN_API_KEY && !process.env.ADMIN_API_KEY.includes('CHANGE') ? 'Enabled (protected)' : '⚠️  Using DEFAULT/weak key!'}`);
      console.log(`✓ Rate Limit: ${isProduction ? '100' : '1000'} req/15min`);
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
