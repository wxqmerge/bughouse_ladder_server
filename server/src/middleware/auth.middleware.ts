import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: 'user' | 'admin';
  };
}

// API Key for admin endpoints (optional - if not set, admin endpoints are publicly accessible)
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// Middleware to verify admin API key using timing-safe comparison
export function requireAdminKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If no API key is configured, allow all requests (local/dev mode)
  if (!ADMIN_API_KEY) {
    next();
    return;
  }

  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey) {
    res.status(401).json({
      success: false,
      error: { message: 'Admin API key required' },
    });
    return;
  }

  // Use timing-safe comparison to prevent timing attacks
  try {
    const keyBuffer = Buffer.from(ADMIN_API_KEY, 'utf-8');
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
        res.status(401).json({
          success: false,
          error: { message: 'Invalid admin API key' },
        });
        return;
      }
    } else if (!crypto.timingSafeEqual(keyBuffer, providedBuffer)) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid admin API key' },
      });
      return;
    }
  } catch (error) {
    console.error('[SECURITY] API Key validation error:', error);
    res.status(401).json({
      success: false,
      error: { message: 'Invalid admin API key' },
    });
    return;
  }

  next();
}
