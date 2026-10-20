import { Router } from 'express';
import type { Request, Response } from 'express';
import QRCode from 'qrcode';
import { authService } from '../services/auth.service.js';
import { config, getPrimaryAddress, getLocalAddresses } from '../config/index.js';

const router = Router();

/**
 * POST /api/pair — Generate a new pairing PIN
 * Called from the PC dashboard to display PIN + QR code
 */
router.post('/generate', async (_req: Request, res: Response) => {
  try {
    const { pin, expiresAt } = authService.generatePin();
    const address = getPrimaryAddress();
    const serverUrl = `http://${address}:${config.port}`;

    // Generate QR code with server URL and embedded pairing info
    const qrData = JSON.stringify({
      url: serverUrl,
      type: 'airbridge-pair',
    });
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: { dark: '#ffffff', light: '#00000000' },
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
  } catch (err) {
    res.status(500).json({
      error: 'Failed to generate pairing PIN',
      code: 'PAIR_ERROR',
    });
  }
});

/**
 * POST /api/pair/verify — Verify PIN and get a session JWT
 * Called from the phone to authenticate
 */
router.post('/verify', (req: Request, res: Response) => {
  const { pin, deviceName } = req.body;

  if (!pin || typeof pin !== 'string') {
    res.status(400).json({
      error: 'PIN is required',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const result = authService.verifyPin(pin, deviceName || 'Unknown Device', clientIp);

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
 * GET /api/pair/pin — Get current PIN status (for PC display)
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
 * GET /api/pair/sessions — List all sessions
 */
router.get('/sessions', (_req: Request, res: Response) => {
  const sessions = authService.getSessions().map((s) => ({
    id: s.id,
    deviceName: s.deviceName,
    active: s.active,
    createdAt: s.createdAt,
    lastActivity: s.lastActivity,
  }));

  res.json({ success: true, data: sessions });
});

/**
 * DELETE /api/pair/session/:id — Revoke a session
 */
router.delete('/session/:id', (req: Request, res: Response) => {
  const revoked = authService.revokeSession(req.params.id);
  if (revoked) {
    res.json({ success: true, message: 'Session revoked' });
  } else {
    res.status(404).json({ error: 'Session not found', code: 'NOT_FOUND' });
  }
});

/**
 * DELETE /api/pair/sessions — Revoke all sessions
 */
router.delete('/sessions', (_req: Request, res: Response) => {
  const count = authService.revokeAllSessions();
  res.json({ success: true, message: `${count} session(s) revoked` });
});

export default router;
