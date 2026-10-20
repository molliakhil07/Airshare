
import { Router } from 'express';
import type { Request, Response } from 'express';
import { hostSessionService, COOKIE_NAME } from '../services/host-session.service.js';

const router = Router();

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3456',
  'http://127.0.0.1:3456',
]);

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;

  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1'
  );
}

function isLocalHostHeader(host: string | undefined): boolean {
  if (!host) return false;

  return (
    host === 'localhost:3456' ||
    host === '127.0.0.1:3456' ||
    host === 'localhost' ||
    host === '127.0.0.1'
  );
}

router.post('/session', (req: Request, res: Response) => {
  const origin = req.get('Origin');
  const host = req.get('Host');

  if (
    !origin ||
    !ALLOWED_ORIGINS.has(origin) ||
    !isLocalHostHeader(host) ||
    !isLoopbackAddress(req.socket.remoteAddress)
  ) {
    res.status(403).json({
      success: false,
      error: 'Dashboard sessions can only be created from the local PC.',
      code: 'LOCAL_DASHBOARD_ONLY',
    });
    return;
  }

  const token = hostSessionService.create();

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
    path: '/api',
    maxAge: 8 * 60 * 60 * 1000,
  });

  res.json({ success: true });
});

router.delete('/session', (req: Request, res: Response) => {
  const origin = req.get('Origin');

  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    res.status(403).json({
      success: false,
      error: 'Invalid dashboard origin.',
    });
    return;
  }

  const cookieHeader = req.headers.cookie || '';
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));

  if (cookie) {
    hostSessionService.revoke(cookie.slice(COOKIE_NAME.length + 1));
  }

  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
    path: '/api',
  });

  res.json({ success: true });
});

export default router;
