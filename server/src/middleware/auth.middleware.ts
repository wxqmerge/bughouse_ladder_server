import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: 'user' | 'admin';
  };
}

function getAdminKey() {
  return process.env.ADMIN_API_KEY || '';
}

function getUserKey() {
  return process.env.USER_API_KEY || '';
}

function timingSafeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf-8');
  const bBuf = Buffer.from(b, 'utf-8');
  const maxLen = Math.max(aBuf.length, bBuf.length);
  const paddedA = Buffer.alloc(maxLen);
  const paddedB = Buffer.alloc(maxLen);
  aBuf.copy(paddedA);
  bBuf.copy(paddedB);
  return crypto.timingSafeEqual(paddedA, paddedB);
}

/**
 * Middleware to verify user API key for write operations.
 * Allows requests through if EITHER the user key matches OR the admin key matches.
 * In production, if no keys are configured, rejects all writes (view-only mode).
 */
export function requireUserKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.headers['x-api-key'] as string;

  // Admin key always grants access (admins can do everything)
  if (getAdminKey() && apiKey && timingSafeCompare(apiKey, getAdminKey())) {
    next();
    return;
  }

  // If user key is configured, validate it
  if (getUserKey()) {
     if (!apiKey) {
        console.warn(`[USER_AUTH] 401 - Missing API key | IP: ${req.ip} | Path: ${req.path}`);
        res.status(401).json({
        success: false,
        error: { message: 'User API key required' },
      });
      return;
    }

    if (!timingSafeCompare(apiKey, getUserKey())) {
      console.warn(`[USER_AUTH] 401 - Invalid API key | IP: ${req.ip} | Path: ${req.path}`);
      res.status(401).json({
        success: false,
        error: { message: 'Invalid user API key' },
      });
      return;
    }
    // User key matched — allow through
    next();
    return;
  }

  // USER_API_KEY is not configured
  if (!getAdminKey()) {
    // Neither USER_API_KEY nor ADMIN_API_KEY configured — view-only mode, reject all writes
    console.warn(`[USER_AUTH] 403 - No API keys configured (view-only mode) | IP: ${req.ip} | Path: ${req.path}`);
    res.status(403).json({
      success: false,
      error: { message: 'Write operations not available — no API keys configured on server' },
    });
    return;
  }

  // ADMIN_API_KEY is configured but USER_API_KEY is not — admin key was already checked above
  // and didn't match, so reject
  console.warn(`[USER_AUTH] 401 - Invalid API key | IP: ${req.ip} | Path: ${req.path}`);
  res.status(401).json({
    success: false,
    error: { message: 'Invalid user API key' },
  });
}

// Middleware to verify admin API key using timing-safe comparison
export function requireAdminKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const adminKey = getAdminKey();
  if (!adminKey) {
    console.warn(`[ADMIN_AUTH] 403 - ADMIN_API_KEY not configured | IP: ${req.ip} | Path: ${req.path}`);
    res.status(403).json({
      success: false,
      error: { message: 'Admin API key not configured on server' },
    });
    return;
  }

  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    console.warn(`[ADMIN_AUTH] 401 - Missing API key | IP: ${req.ip} | Path: ${req.path}`);
    res.status(401).json({
      success: false,
      error: { message: 'Admin API key required' },
    });
    return;
  }

  if (!timingSafeCompare(apiKey, adminKey)) {
    console.warn(`[ADMIN_AUTH] 401 - Invalid API key | IP: ${req.ip} | Path: ${req.path}`);
    res.status(401).json({
      success: false,
      error: { message: 'Invalid admin API key' },
    });
    return;
  }

  next();
}
