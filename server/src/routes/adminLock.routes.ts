import { Router, Request, Response } from 'express';
import { requireAdminKey } from '../middleware/auth.middleware.js';
import {
  tryAcquireAdminLock,
  forceAcquireAdminLock,
  releaseAdminLock,
  refreshAdminLock,
  getAdminLockInfo,
} from '../services/adminLock.service.js';

const router = Router();

// Admin lock endpoints require admin authentication
router.use(requireAdminKey);

/**
 * Try to acquire admin lock
 * POST /api/admin-lock/acquire
 */
router.post('/acquire', (req: Request, res: Response) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const { clientId, clientName } = req.body;

  if (!clientId || !clientName) {
    return res.status(400).json({
      success: false,
      error: 'Missing clientId or clientName',
    });
  }

  const result = tryAcquireAdminLock(clientId, clientName, clientIp);

  if (result.success) {
    res.json({
      success: true,
      message: 'Lock acquired',
    });
  } else {
    res.status(409).json({
      success: false,
      error: 'Lock held by another client',
      heldBy: {
        clientId: result.heldBy?.clientId,
        clientName: result.heldBy?.clientName,
        acquiredAt: result.heldBy?.acquiredAt,
      },
    });
  }
});

/**
 * Force acquire admin lock (override)
 * POST /api/admin-lock/force
 */
router.post('/force', (req: Request, res: Response) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const { clientId, clientName } = req.body;

  if (!clientId || !clientName) {
    return res.status(400).json({
      success: false,
      error: 'Missing clientId or clientName',
    });
  }

  const result = forceAcquireAdminLock(clientId, clientName, clientIp);

  res.json({
    success: true,
    message: 'Lock forced',
    overridden: result.overridden ? {
      clientId: result.overridden.clientId,
      clientName: result.overridden.clientName,
    } : null,
  });
});

/**
 * Release admin lock
 * POST /api/admin-lock/release
 */
router.post('/release', (req: Request, res: Response) => {
  const { clientId } = req.body;

  if (!clientId) {
    return res.status(400).json({
      success: false,
      error: 'Missing clientId',
    });
  }

  const result = releaseAdminLock(clientId);

  res.json({
    success: result,
    message: result ? 'Lock released' : 'Lock not held by this client',
  });
});

/**
 * Refresh admin lock
 * POST /api/admin-lock/refresh
 */
router.post('/refresh', (req: Request, res: Response) => {
  const { clientId } = req.body;

  if (!clientId) {
    return res.status(400).json({
      success: false,
      error: 'Missing clientId',
    });
  }

  const result = refreshAdminLock(clientId);

  res.json({
    success: result,
    message: result ? 'Lock refreshed' : 'Lock not held by this client',
  });
});

/**
 * Get admin lock status
 * GET /api/admin-lock/status
 */
router.get('/status', (req: Request, res: Response) => {
  const info = getAdminLockInfo();

  if (!info.locked) {
    return res.json({
      locked: false,
    });
  }

  res.json({
    locked: true,
    lock: {
      clientId: info.lock?.clientId,
      clientName: info.lock?.clientName,
      ipAddress: info.lock?.ipAddress,
      acquiredAt: info.lock?.acquiredAt,
    },
    expiresAt: info.expiresAt,
  });
});

export { router };
