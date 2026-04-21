import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

const isProduction = process.env.NODE_ENV === 'production';

// Stricter rate limiter for authenticated write endpoints (prevent brute-force)
export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 30 : 100, // 30 in production, 100 in dev
  message: {
    success: false,
    error: { message: 'Too many write requests. Please slow down.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
