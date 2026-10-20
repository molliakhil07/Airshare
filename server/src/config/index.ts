import path from 'node:path';
import os from 'node:os';


/** Server configuration */
export const config = {
  /** Server port */
  port: parseInt(process.env.AIRBRIDGE_PORT || '3456', 10),

  /** Host to bind to — 0.0.0.0 for LAN access */
  host: process.env.AIRBRIDGE_HOST || '0.0.0.0',

  /** Base storage directory for all files */
  storageDir: process.env.AIRBRIDGE_STORAGE || path.join(process.cwd(), '..', 'storage'),

  /** Directory for completed uploads (phone → PC) */
  get uploadsDir(): string {
    return path.join(this.storageDir, 'uploads');
  },

  /** Directory for in-progress transfer chunks */
  get tempDir(): string {
    return path.join(this.storageDir, 'temp');
  },

  /** Directory for share metadata (PC → phone) */
  get sharesDir(): string {
    return path.join(this.storageDir, 'shares');
  },

  /** JWT secret — generated at startup if not provided */
  jwtSecret: process.env.AIRBRIDGE_JWT_SECRET || '',

  /** JWT token expiry */
  jwtExpiry: '24h',

  /** Pairing PIN length */
  pinLength: 6,

  /** PIN validity in milliseconds (5 minutes) */
  pinValidityMs: 5 * 60 * 1000,

  /** Rate limit for pairing attempts (per minute) */
  pairingRateLimit: 5,

  /** Default chunk size in bytes (8 MiB) */
  chunkSize: 8 * 1024 * 1024,

  /** Maximum chunk size allowed (64 MiB) */
  maxChunkSize: 64 * 1024 * 1024,

  /** Maximum concurrent uploads per session */
  maxConcurrentUploads: 3,

  /** Transfer metadata cleanup after hours */
  transferCleanupHours: 72,

  /** Maximum request body size for non-chunk endpoints */
  maxBodySize: '1mb',

  /** Maximum file size (24 GB) */
  maxFileSize: 24 * 1024 * 1024 * 1024,

  /** CORS origin — allow all for local network */
  corsOrigin: '*',
} as const;

/**
 * Get all local network IPv4 addresses
 */
export function getLocalAddresses(): { name: string; address: string }[] {
  const interfaces = os.networkInterfaces();
  const addresses: { name: string; address: string }[] = [];

  for (const [name, nets] of Object.entries(interfaces)) {
    if (!nets) continue;
    for (const net of nets) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ name, address: net.address });
      }
    }
  }

  return addresses;
}

/**
 * Get the most likely LAN address for display
 */
export function getPrimaryAddress(): string {
  const addrs = getLocalAddresses();
  // Prefer Wi-Fi or Ethernet adapters
  const preferred = addrs.find(
    (a) =>
      a.name.toLowerCase().includes('wi-fi') ||
      a.name.toLowerCase().includes('wifi') ||
      a.name.toLowerCase().includes('wlan') ||
      a.name.toLowerCase().includes('ethernet')
  );
  return preferred?.address || addrs[0]?.address || '127.0.0.1';
}
