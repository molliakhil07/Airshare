import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import type { ShareMeta, ShareResponse } from '../types/index.js';

/**
 * ShareService manages PC→Phone file sharing:
 * - Register files from PC for download
 * - Stream downloads with HTTP Range support
 * - Track download counts
 * - Cleanup expired shares
 */
class ShareService {
  private shares: Map<string, ShareMeta> = new Map();
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    await fsp.mkdir(config.sharesDir, { recursive: true });

    // Load existing share metadata
    try {
      const entries = await fsp.readdir(config.sharesDir);
      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          try {
            const data = await fsp.readFile(path.join(config.sharesDir, entry), 'utf-8');
            const share: ShareMeta = JSON.parse(data);
            this.shares.set(share.id, share);
          } catch {
            // Skip invalid files
          }
        }
      }
    } catch {
      // Directory might not exist yet
    }
  }

  async ready(): Promise<void> {
    await this.initPromise;
  }

  /**
   * Share a file from the PC for download
   * @param filePath Absolute path to the file on the PC
   * @param sessionId The session that created this share
   */
  async shareFile(filePath: string, sessionId: string): Promise<ShareMeta> {
    await this.ready();

    // Resolve and validate the path
    const resolved = path.resolve(filePath);

    // Verify the file exists and is readable
    try {
      const stat = await fsp.stat(resolved);
      if (!stat.isFile()) {
        throw new Error('Path is not a file');
      }
      if (stat.size > config.maxFileSize) {
        throw new Error(`File exceeds maximum size of ${config.maxFileSize} bytes`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('maximum size')) throw err;
      throw new Error(`File not accessible: ${filePath}`);
    }

    const id = crypto.randomUUID();
    const fileName = path.basename(resolved);
    const stat = await fsp.stat(resolved);

    // Detect MIME type from extension
    const mimeType = this.getMimeType(fileName);

    const share: ShareMeta = {
      id,
      fileName,
      filePath: resolved,
      fileSize: stat.size,
      mimeType,
      sessionId,
      createdAt: new Date().toISOString(),
      downloadCount: 0,
    };

    // Persist to disk
    await fsp.writeFile(
      path.join(config.sharesDir, `${id}.json`),
      JSON.stringify(share, null, 2)
    );

    this.shares.set(id, share);
    return share;
  }

  /**
   * Get a share by ID (includes internal filePath for streaming)
   */
  getShare(shareId: string): ShareMeta | null {
    return this.shares.get(shareId) || null;
  }

  /**
   * List all shares (safe response without internal paths)
   */
  listShares(sessionId?: string): ShareResponse[] {
    let shares = Array.from(this.shares.values());
    if (sessionId) {
      shares = shares.filter((s) => s.sessionId === sessionId);
    }

    return shares.map((s) => ({
      id: s.id,
      fileName: s.fileName,
      fileSize: s.fileSize,
      mimeType: s.mimeType,
      hash: s.hash,
      createdAt: s.createdAt,
      downloadCount: s.downloadCount,
    }));
  }

  /**
   * Increment download count
   */
  async recordDownload(shareId: string): Promise<void> {
    const share = this.shares.get(shareId);
    if (share) {
      share.downloadCount++;
      await fsp.writeFile(
        path.join(config.sharesDir, `${shareId}.json`),
        JSON.stringify(share, null, 2)
      );
    }
  }

  /**
   * Remove a share
   */
  async removeShare(shareId: string, sessionId: string): Promise<boolean> {
    const share = this.shares.get(shareId);
    if (!share) return false;
    if (share.sessionId !== sessionId) throw new Error('Unauthorized');

    this.shares.delete(shareId);
    await fsp.unlink(path.join(config.sharesDir, `${shareId}.json`)).catch(() => {});
    return true;
  }

  /**
   * Create a read stream for downloading, supporting Range requests
   */
  createDownloadStream(
    share: ShareMeta,
    range?: { start: number; end: number }
  ): { stream: fs.ReadStream; start: number; end: number; total: number } {
    const total = share.fileSize;
    const start = range?.start ?? 0;
    const end = range?.end ?? total - 1;

    const stream = fs.createReadStream(share.filePath, { start, end: end + 1 });
    return { stream, start, end, total };
  }

  /** Simple MIME type detection from file extension */
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.html': 'text/html',
      '.apk': 'application/vnd.android.package-archive',
      '.iso': 'application/x-iso9660-image',
    };
    return mimeMap[ext] || 'application/octet-stream';
  }
}

export const shareService = new ShareService();
