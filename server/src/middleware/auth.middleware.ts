import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface AuthRequest extends Request {
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
  if (getAdminKey() && apiKey === getAdminKey()) {
    next();
    return;
  }

  // If user key is configured, validate it
  if (getUserKey()) {
    if (!apiKey) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[USER_AUTH] 401 - Missing API key | IP: ${req.ip} | Path: ${req.path}`);
      }
      res.status(401).json({
        success: false,
        error: { message: 'User API key required' },
      });
      return;
    }

    if (apiKey !== getUserKey()) {
      console.log(`[USER_AUTH] 401 - Invalid API key | IP: ${req.ip} | Path: ${req.path}`);
      res.status(401).json({
        success: false,
        error: { message: 'Invalid user API key' },
      });
      return;
    }
  }

  // If we got here: USER_API_KEY is not configured, so allow the request (dev mode)
  next();
}

// Middleware to verify admin API key using timing-safe comparison
export function requireAdminKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // In production, admin key is mandatory - reject if not configured
  const adminKey = getAdminKey();
  if (process.env.NODE_ENV === 'production' && !adminKey) {
    console.log(`[ADMIN_AUTH] 403 - ADMIN_API_KEY not configured in production | IP: ${req.ip} | Path: ${req.path}`);
    res.status(403).json({
      success: false,
      error: { message: 'Admin API key not configured on server' },
    });
    return;
  }
  
  // In dev mode, if no API key configured, allow all requests
  if (!adminKey) {
    next();
    return;
  }

  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    console.log(`[ADMIN_AUTH] 401 - Missing API key | IP: ${req.ip} | Path: ${req.path}`);
    res.status(401).json({
      success: false,
      error: { message: 'Admin API key required' },
    });
    return;
  }

  // Use timing-safe comparison to prevent timing attacks
  try {
    const keyBuffer = Buffer.from(adminKey, 'utf-8');
    const providedBuffer = Buffer.from(apiKey, 'utf-8');
    
    // If lengths differ, crypto.timingSafeEqual will throw, so handle gracefully
    if (keyBuffer.length !== providedBuffer.length) {
      // Still use timing-safe comparison with padded buffer to avoid length leakage
      const maxLen = Math.max(keyBuffer.length, providedBuffer.length);
      const paddedKey = Buffer.alloc(maxLen);
      const paddedProvided = Buffer.alloc(maxLen);
      keyBuffer.copy(paddedKey);
      providedBuffer.copy(paddedProvided);
      
      if (!crypto.timingSafeEqual(paddedKey, paddedProvided)) {
        console.log(`[ADMIN_AUTH] 401 - Invalid API key | IP: ${req.ip} | Path: ${req.path}`);
        res.status(401).json({
          success: false,
          error: { message: 'Invalid admin API key' },
        });
        return;
      }
    } else if (!crypto.timingSafeEqual(keyBuffer, providedBuffer)) {
      console.log(`[ADMIN_AUTH] 401 - Invalid API key | IP: ${req.ip} | Path: ${req.path}`);
      res.status(401).json({
        success: false,
        error: { message: 'Invalid admin API key' },
      });
      return;
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[ADMIN_AUTH] 401 - Key validation error | IP: ${req.ip} | Path: ${req.path} | Error: ${(error as Error).message}`);
    }
    res.status(401).json({
      success: false,
      error: { message: 'Invalid admin API key' },
    });
    return;
  }

  next();
}
