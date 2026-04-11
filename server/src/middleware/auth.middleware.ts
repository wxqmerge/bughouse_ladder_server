import { Router, Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: 'user' | 'admin';
  };
}

// API Key for admin endpoints (optional - if not set, admin endpoints are publicly accessible)
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

// Middleware to verify admin API key
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

  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    res.status(401).json({
      success: false,
      error: { message: 'Admin API key required' },
    });
    return;
  }

  next();
}
