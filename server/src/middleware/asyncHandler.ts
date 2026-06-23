import { Request, Response, NextFunction } from 'express';

/**
 * Wrapper for async Express route handlers.
 * Catches thrown errors (including AppError) and passes them to
 * the errorHandler middleware via next(err).
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => {
 *     throw new AppError('Not found', 404);
 *     res.json({ success: true });
 *   }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next?: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next?: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
