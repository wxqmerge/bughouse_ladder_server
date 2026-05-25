import { Router, Request, Response } from 'express';
import { requireAdminKey } from '../middleware/auth.middleware.js';
import {
  tryAcquireAdminLock,
  forceAcquireAdminLock,
  releaseAdminLock,
  refreshAdminLock,
  getAdminLockInfo,
} from '../services/adminLock.service.js';
import { validateClientId } from '../utils/validation.js';

const router = Router();

/**
 * Get admin lock status (public endpoint - no auth required)
 * GET /api/admin-lock/status
 * Returns structured info so the client can distinguish:
 * - server has no admin key configured
 * - client didn't send a valid key
 * - lock is held by another client
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const adminKeySet = !!process.env.ADMIN_API_KEY;
    const providedKey = req.headers['x-api-key'] as string;
    const hasValidKey = adminKeySet && providedKey === process.env.ADMIN_API_KEY;

    const info = getAdminLockInfo();

    const base = {
      adminConfigured: adminKeySet,
      hasValidKey,
      locked: info.locked,
    };

    if (info.locked) {
      return res.json({
        ...base,
        lock: {
          clientId: info.lock?.clientId,
          clientName: info.lock?.clientName,
          ipAddress: info.lock?.ipAddress,
          acquiredAt: info.lock?.acquiredAt,
        },
        expiresAt: info.expiresAt,
      });
    }

    res.json(base);
  } catch (error) {
    console.error('[ADMIN-LOCK] Status error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to get lock status' } });
  }
});

// Admin lock endpoints require admin authentication
router.use(requireAdminKey);

/**
 * Try to acquire admin lock
 * POST /api/admin-lock/acquire
 */
router.post('/acquire', (req: Request, res: Response) => {
  try {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const { clientId, clientName } = validateClientId(req.body);

    if (!clientName) {
      return res.status(400).json({
        success: false,
        error: 'Missing clientName',
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
  } catch (error) {
    console.error('[ADMIN-LOCK] Acquire error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to acquire lock' } });
  }
});

/**
 * Force acquire admin lock (override)
 * POST /api/admin-lock/force
 */
router.post('/force', (req: Request, res: Response) => {
  try {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const { clientId, clientName } = validateClientId(req.body);

    if (!clientName) {
      return res.status(400).json({
        success: false,
        error: 'Missing clientName',
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
  } catch (error) {
    console.error('[ADMIN-LOCK] Force error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to force lock' } });
  }
});

/**
 * Release admin lock
 * POST /api/admin-lock/release
 */
router.post('/release', (req: Request, res: Response) => {
  try {
    const { clientId } = validateClientId(req.body);

    const result = releaseAdminLock(clientId);

    res.json({
      success: result,
      message: result ? 'Lock released' : 'Lock not held by this client',
    });
  } catch (error) {
    console.error('[ADMIN-LOCK] Release error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to release lock' } });
  }
});

/**
 * Refresh admin lock
 * POST /api/admin-lock/refresh
 */
router.post('/refresh', (req: Request, res: Response) => {
  try {
    const { clientId } = validateClientId(req.body);

    const result = refreshAdminLock(clientId);

    res.json({
      success: result,
      message: result ? 'Lock refreshed' : 'Lock not held by this client',
    });
  } catch (error) {
    console.error('[ADMIN-LOCK] Refresh error:', error);
    res.status(500).json({ success: false, error: { message: 'Failed to refresh lock' } });
  }
});

export { router };
