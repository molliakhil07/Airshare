import type { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';
import {
  COOKIE_NAME,
  hostSessionService,
} from '../services/host-session.service.js';

declare global {
  namespace Express {
    interface Request {
      sessionId?: string;
    }
  }
}

function readCookie(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  const prefix = `${name}=`;
  const item = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return item ? item.slice(prefix.length) : undefined;
}

/** Authenticate the PC dashboard using a temporary HttpOnly cookie. */
export function requireHostDashboardToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = readCookie(req, COOKIE_NAME);

  if (!token || !hostSessionService.isValid(token)) {
    res.status(401).json({
      error: 'Host dashboard session required. Open the dashboard on this PC.',
      code: 'HOST_SESSION_REQUIRED',
    });
    return;
  }

  next();
}

/** Require a valid paired-device JWT. */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  let token: string | undefined;
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const result = authService.verifyToken(token);

  if (!result.valid || !result.sessionId) {
    res.status(401).json({
      error: result.error || 'Invalid token',
      code: 'AUTH_INVALID',
    });
    return;
  }

  req.sessionId = result.sessionId;
  next();
}

/** Validate required request-body fields. */
export function validateBody(requiredFields: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const missing = requiredFields.filter((field) => {
      const value = req.body?.[field];
      return value === undefined || value === null || value === '';
    });

    if (missing.length > 0) {
      res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}`,
        code: 'VALIDATION_ERROR',
      });
      return;
    }

    next();
  };
}

/** Global error handler. */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(`[Error] ${req.method} ${req.path}:`, err.message);

  if (err.message.includes('Unauthorized')) {
    res.status(403).json({ error: err.message, code: 'FORBIDDEN' });
    return;
  }

  if (err.message.includes('not found') || err.message.includes('Not found')) {
    res.status(404).json({ error: err.message, code: 'NOT_FOUND' });
    return;
  }

  if (err.message.includes('Invalid') || err.message.includes('must be')) {
    res.status(400).json({ error: err.message, code: 'BAD_REQUEST' });
    return;
  }

  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  });
}
