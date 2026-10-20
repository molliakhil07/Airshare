
import { randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const COOKIE_NAME = 'airbridge_host_session';

interface HostSession {
  tokenHash: Buffer;
  expiresAt: number;
}

class HostSessionService {
  private readonly sessions = new Map<string, HostSession>();

  create(): string {
    this.cleanupExpired();

    const token = randomBytes(32).toString('hex');
    const tokenHash = Buffer.from(token, 'hex');

    this.sessions.set(token, {
      tokenHash,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });

    return token;
  }

  isValid(token: string): boolean {
    const session = this.sessions.get(token);

    if (!session || session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return false;
    }

    const suppliedHash = Buffer.from(token, 'hex');

    return (
      suppliedHash.length === session.tokenHash.length &&
      timingSafeEqual(suppliedHash, session.tokenHash)
    );
  }

  revoke(token: string): void {
    this.sessions.delete(token);
  }

  cleanupExpired(): void {
    const now = Date.now();

    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(token);
      }
    }
  }
}

export { COOKIE_NAME };
export const hostSessionService = new HostSessionService();
