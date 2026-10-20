import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import type { PairingSession } from '../types/index.js';

/** In-memory store for active pairing PINs and sessions */
class AuthService {
  private currentPin: { pin: string; expiresAt: number; pairingToken: string } | null = null;
  private sessions: Map<string, PairingSession> = new Map();
  private jwtSecret: string;
  private pairingAttempts: Map<string, { count: number; resetAt: number }> = new Map();

  constructor() {
    // Generate a secure JWT secret at startup
    this.jwtSecret = config.jwtSecret || crypto.randomBytes(64).toString('hex');
  }

  /**
   * Generate a new pairing PIN and token
   */
  generatePin(): { pin: string; pairingToken: string; expiresAt: number } {
    const pin = this.generateSecurePin(config.pinLength);
    const pairingToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + config.pinValidityMs;

    this.currentPin = { pin, expiresAt, pairingToken };

    return { pin, pairingToken, expiresAt };
  }

  /**
   * Verify a PIN and issue a JWT session token
   */
  verifyPin(
    pin: string,
    deviceName: string,
    clientIp: string
  ): { success: boolean; token?: string; session?: PairingSession; error?: string } {
    // Rate limiting
    if (!this.checkRateLimit(clientIp)) {
      return { success: false, error: 'Too many pairing attempts. Try again later.' };
    }

    if (!this.currentPin) {
      return { success: false, error: 'No active pairing PIN. Generate one from the PC.' };
    }

    if (Date.now() > this.currentPin.expiresAt) {
      this.currentPin = null;
      return { success: false, error: 'PIN has expired. Generate a new one.' };
    }

    // Constant-time comparison to prevent timing attacks
    const pinBuffer = Buffer.from(pin);
    const expectedBuffer = Buffer.from(this.currentPin.pin);
    if (pinBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(pinBuffer, expectedBuffer)) {
      this.recordAttempt(clientIp);
      return { success: false, error: 'Invalid PIN.' };
    }

    // PIN is valid — create session
    const sessionId = crypto.randomUUID();
    const token = jwt.sign(
      { sessionId, deviceName },
      this.jwtSecret,
      { expiresIn: config.jwtExpiry }
    );

    const now = new Date();
    const session: PairingSession = {
      id: sessionId,
      deviceName,
      token,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      active: true,
      lastActivity: now.toISOString(),
    };

    this.sessions.set(sessionId, session);

    // Invalidate the PIN after successful pairing
    this.currentPin = null;

    return { success: true, token, session };
  }

  /**
   * Verify a JWT token and return the session
   */
  verifyToken(token: string): { valid: boolean; sessionId?: string; error?: string } {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as { sessionId: string; deviceName: string };
      const session = this.sessions.get(payload.sessionId);

      if (!session || !session.active) {
        return { valid: false, error: 'Session revoked or expired.' };
      }

      // Update last activity
      session.lastActivity = new Date().toISOString();

      return { valid: true, sessionId: payload.sessionId };
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return { valid: false, error: 'Session expired.' };
      }
      return { valid: false, error: 'Invalid token.' };
    }
  }

  /**
   * Revoke a session
   */
  revokeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.active = false;
      return true;
    }
    return false;
  }

  /**
   * Revoke all sessions
   */
  revokeAllSessions(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.active) {
        session.active = false;
        count++;
      }
    }
    return count;
  }

  /**
   * Get all sessions
   */
  getSessions(): PairingSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): PairingSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.active);
  }

  /**
   * Get current PIN info (for display on PC)
   */
  getCurrentPin(): { pin: string; expiresAt: number } | null {
    if (!this.currentPin || Date.now() > this.currentPin.expiresAt) {
      this.currentPin = null;
      return null;
    }
    return { pin: this.currentPin.pin, expiresAt: this.currentPin.expiresAt };
  }

  /** Generate a cryptographically secure numeric PIN */
  private generateSecurePin(length: number): string {
    let pin = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      pin += (bytes[i] % 10).toString();
    }
    return pin;
  }

  /** Check rate limiting for an IP */
  private checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const record = this.pairingAttempts.get(ip);

    if (!record || now > record.resetAt) {
      return true;
    }

    return record.count < config.pairingRateLimit;
  }

  /** Record a failed pairing attempt */
  private recordAttempt(ip: string): void {
    const now = Date.now();
    const record = this.pairingAttempts.get(ip);

    if (!record || now > record.resetAt) {
      this.pairingAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    } else {
      record.count++;
    }
  }
}

export const authService = new AuthService();
