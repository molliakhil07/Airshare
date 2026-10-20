import { Router } from 'express';
import type { Request, Response } from 'express';
import QRCode from 'qrcode';
import { authService } from '../services/auth.service.js';
import {
  config,
  getPrimaryAddress,
  getLocalAddresses,
} from '../config/index.js';
import {
  requireHostDashboardToken,
  requireAuth,
} from '../middleware/index.js';

const router = Router();

/**
 * POST /api/pair/generate
 * Generate a pairing PIN for the PC dashboard.
 * Requires a valid temporary host session.
 */
router.post(
  '/generate',
  requireHostDashboardToken,
  async (_req: Request, res: Response) => {
    try {
      const { pin, expiresAt } = authService.generatePin();
      const address = getPrimaryAddress();
      const serverUrl = `http://${address}:${config.port}`;

      const qrData = JSON.stringify({
        url: serverUrl,
        type: 'airbridge-pair',
      });

      const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
        width: 300,
        margin: 2,
        color: {
          dark: '#ffffff',
          light: '#00000000',
        },
      });

      res.json({
        success: true,
        data: {
          pin,
          expiresAt,
          serverUrl,
          qrCode: qrCodeDataUrl,
          addresses: getLocalAddresses(),
        },
      });
    } catch {
      res.status(500).json({
        error: 'Failed to generate pairing PIN',
        code: 'PAIR_ERROR',
      });
    }
  }
);

/**
 * POST /api/pair/verify
 * Verify a PIN and issue a session JWT to the phone.
 * Intentionally remains accessible without a host cookie.
 */
router.post('/verify', (req: Request, res: Response) => {
  const { pin, deviceName } = req.body ?? {};

  if (typeof pin !== 'string' || !pin.trim()) {
    res.status(400).json({
      error: 'PIN is required',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  const result = authService.verifyPin(
    pin,
    typeof deviceName === 'string' ? deviceName : 'Unknown Device',
    clientIp
  );

  if (!result.success) {
    res.status(401).json({
      error: result.error,
      code: 'PAIR_FAILED',
    });
    return;
  }

  res.json({
    success: true,
    data: {
      token: result.token,
      sessionId: result.session?.id,
      expiresAt: result.session?.expiresAt,
    },
  });
});

/**
 * GET /api/pair/pin
 * Return the current PIN status.
 */
router.get('/pin', (_req: Request, res: Response) => {
  const pin = authService.getCurrentPin();

  res.json({
    success: true,
    data: {
      active: !!pin,
      pin: pin?.pin,
      expiresAt: pin?.expiresAt,
    },
  });
});

/**
 * GET /api/pair/sessions
 * List paired devices. Requires a host session.
 */
router.get(
  '/sessions',
  requireHostDashboardToken,
  (_req: Request, res: Response) => {
    const sessions = authService.getSessions().map((session) => ({
      id: session.id,
      deviceName: session.deviceName,
      active: session.active,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
    }));

    res.json({
      success: true,
      data: sessions,
    });
  }
);

/**
 * DELETE /api/pair/disconnect
 * Allow a paired phone to disconnect its own session.
 */
router.delete('/disconnect', requireAuth, (req: Request, res: Response) => {
  const sessionId = req.sessionId;

  if (!sessionId) {
    res.status(401).json({
      success: false,
      error: 'No active phone session.',
    });
    return;
  }

  const revoked = authService.revokeSession(sessionId);

  if (!revoked) {
    res.status(404).json({
      success: false,
      error: 'Phone session not found.',
    });
    return;
  }

  res.json({
    success: true,
    message: 'Phone disconnected successfully.',
  });
});

/**
 * DELETE /api/pair/session/:id
 * Revoke a paired-device session.
 */
router.delete(
  '/session/:id',
  requireHostDashboardToken,
  (req: Request, res: Response) => {
    const revoked = authService.revokeSession(req.params.id);

    if (revoked) {
      res.json({
        success: true,
        message: 'Session revoked',
      });
      return;
    }

    res.status(404).json({
      error: 'Session not found',
      code: 'NOT_FOUND',
    });
  }
);

/**
 * DELETE /api/pair/sessions
 * Revoke all paired-device sessions.
 */
router.delete(
  '/sessions',
  requireHostDashboardToken,
  (_req: Request, res: Response) => {
    const count = authService.revokeAllSessions();

    res.json({
      success: true,
      message: `${count} session(s) revoked`,
    });
  }
);

export default router;
