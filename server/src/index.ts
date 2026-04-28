import dotenv from 'dotenv';

// Load environment variables from multiple possible locations
dotenv.config({ path: '.env' });
dotenv.config({ path: '../.env' });

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { serverVersion } from './services/dataService.js';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import routes
import { router as authRouter } from './routes/auth.routes.js';
import { router as ladderRouter } from './routes/ladder.routes.js';
import { router as gameRouter } from './routes/game.routes.js';
import { router as adminRouter } from './routes/admin.routes.js';
import { router as adminLockRouter } from './routes/adminLock.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { initializeDefaultLadder } from './services/dataService.js';
import { generatePerformanceReport, clearSlowOperations } from './utils/performance.js';
import { getWriteHealth } from './services/dataService.js';

const app: Application = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Debug: Show environment variables at startup
console.log('Environment variables loaded:');
console.log('  - NODE_ENV:', process.env.NODE_ENV);
console.log('  - PORT:', process.env.PORT);
console.log('  - CORS_ORIGINS:', process.env.CORS_ORIGINS || '(not set)');
console.log('  - ADMIN_API_KEY:', process.env.ADMIN_API_KEY ? 'Set' : 'NOT SET');

// Trust proxy for proper IP handling behind reverse proxy
app.set('trust proxy', 1);

// Consolidated request logging - logs all requests in one line
app.use((req, res, next) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  
  // Hook into response finish to log complete request info
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any, callback?: any) {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    const method = req.method;
    const path = req.path;
    
    // Build query string if present
    let queryString = '';
    if (Object.keys(req.query).length > 0) {
      const qstr = Object.entries(req.query)
        .map(([k, v]) => `${k}=${v}`)
        .join('&');
      queryString = ` ?${qstr}`;
    }
    
    // Single consolidated log line
    console.log(`[API] ${clientIp} ${method.padEnd(4)} ${path}${queryString.padEnd(35)} ${status.toString().padStart(3)} ${duration}ms`);
    
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

// Admin lock rate limiter (very lenient - status checks happen every second)
const adminLockLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 600, // 10 requests per second allowed
  message: { success: false, error: { message: 'Too many admin lock requests.' } },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter);
app.use('/api/admin-lock', adminLockLimiter); // Apply lenient limiter to admin-lock
app.use('/api', apiLimiter); // General limiter for other API routes

// CORS configuration - MUST come before Helmet!
// Get allowed origins from environment variable (comma-separated list)
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(o => o) || ['*'];

console.log('[CORS] Configuration:');
console.log('  - CORS_ORIGINS env var:', process.env.CORS_ORIGINS);
console.log('  - Parsed origins:', corsOrigins);

app.use(cors({
  origin: corsOrigins.length === 1 && corsOrigins[0] === '*' ? '*' : corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Security middleware with Content Security Policy
app.use(helmet({
  contentSecurityPolicy: isProduction ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", corsOrigins[0] !== '*' ? new URL(corsOrigins[0]).origin : "'self'"],
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
  const wh = getWriteHealth();
  res.json({
    status: 'ok',
    version: serverVersion,
    timestamp: new Date().toISOString(),
    writeHealth: {
      lastWriteTime: wh.lastWriteTime,
      lastWriteSuccess: wh.lastWriteSuccess,
      lastError: wh.lastError,
      lastErrorTime: wh.lastErrorTime,
      consecutiveFailures: wh.consecutiveFailures,
    },
  });
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/ladder', ladderRouter);
app.use('/api/games', gameRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin-lock', adminLockRouter);

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
      const host = '0.0.0.0';
      const serverUrl = `http://localhost:${PORT}`;
      
      console.log('\n========================================');
      console.log('  BUGHOUSE CHESS LADDER SERVER');
      console.log('========================================\n');
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ CORS Origins: ${process.env.CORS_ORIGINS || '*'}`);
      const adminKeySet = !!process.env.ADMIN_API_KEY;
      console.log(`✓ Admin API Key: ${adminKeySet ? 'Enabled' : '⚠️  NOT SET (endpoints unprotected)'}`);
      console.log(`✓ Rate Limit: ${isProduction ? '100' : '1000'} req/15min`);
      console.log('');
      
      // Connection instructions for clients
      console.log('CLIENT CONFIGURATION:');
      console.log(`  Open this URL to configure a client:`);
      console.log(`  http://your-host:${PORT}/?config=1&server=http://your-host:${PORT}`);
      console.log('');
      
      if (!adminKeySet) {
        console.log('⚠️  SECURITY WARNING: ADMIN_API_KEY is not set!');
        console.log('  All admin and write endpoints are publicly accessible.');
        console.log('  Set ADMIN_API_KEY in .env to protect your server.');
        console.log('');
      }
      if (process.env.NODE_ENV !== 'production' && adminKeySet) {
        console.log('⚠️  DEVELOPMENT MODE');
        console.log('  - Admin endpoints protected with API key');
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
const isMainModule = process.argv[1] && (path.basename(process.argv[1]).endsWith('index.ts') || path.basename(process.argv[1]).endsWith('index.js'));
if (isMainModule) {
  startServer();
}

export default app;
