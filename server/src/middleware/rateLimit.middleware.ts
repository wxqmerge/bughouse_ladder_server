import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// Stricter rate limiter for authenticated write endpoints (prevent brute-force)
export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: {
    success: false,
    error: { message: 'Too many write requests. Please slow down.' },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
