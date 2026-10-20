import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import type {
  TransferMeta,
  TransferStatus,
  TransferStatusResponse,
  CreateTransferRequest,
} from '../types/index.js';

/**
 * TransferService manages the lifecycle of file uploads:
 * - Creating transfers with metadata
 * - Receiving and storing chunks to disk
 * - Tracking chunk completion via bitmap
 * - Assembling chunks into final file
 * - SHA-256 verification
 * - Resuming interrupted transfers
 * - Cleanup of temporary data
 */
class TransferService {
  private transfers: Map<string, TransferMeta> = new Map();
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.init();
  }

  /** Initialize storage directories and load persisted transfer metadata */
  private async init(): Promise<void> {
    await fsp.mkdir(config.uploadsDir, { recursive: true });
    await fsp.mkdir(config.tempDir, { recursive: true });
    await fsp.mkdir(config.sharesDir, { recursive: true });

    // Load existing transfer metadata from disk for resume support
    try {
      const entries = await fsp.readdir(config.tempDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metaPath = path.join(config.tempDir, entry.name, 'meta.json');
          try {
            const data = await fsp.readFile(metaPath, 'utf-8');
            const meta: TransferMeta = JSON.parse(data);
            // Only load non-completed transfers
            if (meta.status !== 'completed' && meta.status !== 'cancelled') {
              this.transfers.set(meta.id, meta);
            }
          } catch {
            // Skip invalid metadata files
          }
        }
      }
    } catch {
      // tempDir might not exist yet
    }
  }

  /** Wait for initialization */
  async ready(): Promise<void> {
    await this.initPromise;
  }

  /**
 * Return the saved path for a completed transfer.
 * The path is derived from server-side metadata, never from user input.
 */
async getCompletedFilePath(transferId: string): Promise<string | null> {
  await this.ready();

  const meta = this.transfers.get(transferId);

  if (!meta || meta.status !== 'completed') {
    return null;
  }

  const filePath = path.resolve(config.uploadsDir, meta.safeName);
  const uploadsRoot = path.resolve(config.uploadsDir);

  // Ensure the resolved path stays inside the uploads directory.
  if (path.dirname(filePath) !== uploadsRoot) {
    return null;
  }

  try {
    await fsp.access(filePath, fs.constants.F_OK);
    return filePath;
  } catch {
    return null;
  }
}

  /**
   * Create a new transfer
   */
  async createTransfer(
    req: CreateTransferRequest,
    sessionId: string
  ): Promise<TransferMeta> {
    await this.ready();

    // Validate file size
    if (req.fileSize <= 0 || req.fileSize > config.maxFileSize) {
      throw new Error(`File size must be between 1 byte and ${config.maxFileSize} bytes (24 GB)`);
    }

    // Validate and sanitize filename
    const safeName = this.sanitizeFilename(req.fileName);
    if (!safeName) {
      throw new Error('Invalid filename');
    }

    // Check available disk space
    await this.checkDiskSpace(req.fileSize);

    const chunkSize = req.chunkSize || config.chunkSize;
    if (chunkSize < 1024 || chunkSize > config.maxChunkSize) {
      throw new Error(`Chunk size must be between 1KB and ${config.maxChunkSize / 1024 / 1024}MB`);
    }

    const totalChunks = Math.ceil(req.fileSize / chunkSize);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const meta: TransferMeta = {
      id,
      originalName: req.fileName,
      safeName: this.ensureUniqueFilename(safeName),
      mimeType: req.mimeType || 'application/octet-stream',
      totalSize: req.fileSize,
      chunkSize,
      totalChunks,
      chunkBitmap: new Array(totalChunks).fill(false),
      chunksReceived: 0,
      bytesReceived: 0,
      status: 'pending',
      direction: 'upload',
      clientHash: req.clientHash,
      sessionId,
      createdAt: now,
      updatedAt: now,
    };

    // Create temp directory for chunks
    const transferDir = path.join(config.tempDir, id);
    await fsp.mkdir(transferDir, { recursive: true });

    // Persist metadata
    await this.saveMeta(meta);
    this.transfers.set(id, meta);

    return meta;
  }

  /**
   * Receive and store a chunk
   * Writes chunk data directly to disk via streaming — never buffers entire file.
   */
  async receiveChunk(
    transferId: string,
    chunkIndex: number,
    data: Buffer,
    sessionId: string
  ): Promise<{ bytesReceived: number; chunksReceived: number; totalChunks: number }> {
    const meta = this.transfers.get(transferId);
    if (!meta) throw new Error('Transfer not found');
    if (meta.sessionId !== sessionId) throw new Error('Unauthorized');
    if (meta.status === 'completed') throw new Error('Transfer already completed');
    if (meta.status === 'cancelled') throw new Error('Transfer was cancelled');

    if (chunkIndex < 0 || chunkIndex >= meta.totalChunks) {
      throw new Error(`Invalid chunk index: ${chunkIndex}. Must be 0-${meta.totalChunks - 1}`);
    }

    // Validate chunk size
    const isLastChunk = chunkIndex === meta.totalChunks - 1;
    const expectedSize = isLastChunk
      ? meta.totalSize - chunkIndex * meta.chunkSize
      : meta.chunkSize;

    if (data.length !== expectedSize) {
      throw new Error(
        `Invalid chunk size: got ${data.length}, expected ${expectedSize}`
      );
    }

    // Write chunk to disk (idempotent — overwrites if already exists)
    const chunkPath = path.join(config.tempDir, transferId, `chunk_${String(chunkIndex).padStart(6, '0')}`);
    await fsp.writeFile(chunkPath, data);

    // Update bitmap
    if (!meta.chunkBitmap[chunkIndex]) {
      meta.chunkBitmap[chunkIndex] = true;
      meta.chunksReceived++;
      meta.bytesReceived += data.length;
    }

    meta.status = 'uploading';
    meta.updatedAt = new Date().toISOString();
    await this.saveMeta(meta);

    return {
      bytesReceived: meta.bytesReceived,
      chunksReceived: meta.chunksReceived,
      totalChunks: meta.totalChunks,
    };
  }

  /**
   * Finalize a transfer: assemble chunks and verify integrity
   */
  async finalizeTransfer(transferId: string, sessionId: string): Promise<TransferMeta> {
    const meta = this.transfers.get(transferId);
    if (!meta) throw new Error('Transfer not found');
    if (meta.sessionId !== sessionId) throw new Error('Unauthorized');

    // Verify all chunks received
    const missing = this.getMissingChunks(meta);
    if (missing.length > 0) {
      throw new Error(`Cannot finalize: ${missing.length} chunks missing (${missing.slice(0, 10).join(', ')}...)`);
    }

    meta.status = 'finalizing';
    meta.updatedAt = new Date().toISOString();
    await this.saveMeta(meta);

    const transferDir = path.join(config.tempDir, transferId);
    const finalPath = path.join(config.uploadsDir, meta.safeName);

    try {
      // Assemble chunks by streaming them into the final file
      const hash = crypto.createHash('sha256');
      const writeStream = fs.createWriteStream(finalPath);

      for (let i = 0; i < meta.totalChunks; i++) {
        const chunkPath = path.join(transferDir, `chunk_${String(i).padStart(6, '0')}`);
        const chunkData = await fsp.readFile(chunkPath);
        hash.update(chunkData);

        await new Promise<void>((resolve, reject) => {
          const ok = writeStream.write(chunkData);
          if (ok) {
            resolve();
          } else {
            writeStream.once('drain', resolve);
            writeStream.once('error', reject);
          }
        });
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.once('error', reject);
      });

      meta.serverHash = hash.digest('hex');

      // Verify against client hash if provided
      if (meta.clientHash && meta.clientHash !== meta.serverHash) {
        // Delete the assembled file — integrity check failed
        await fsp.unlink(finalPath).catch(() => {});
        meta.status = 'failed';
        meta.error = `Integrity check failed. Client hash: ${meta.clientHash}, Server hash: ${meta.serverHash}`;
        meta.updatedAt = new Date().toISOString();
        await this.saveMeta(meta);
        throw new Error(meta.error);
      }

      // Success — update metadata
      meta.status = 'completed';
      meta.completedAt = new Date().toISOString();
      meta.updatedAt = meta.completedAt;
      await this.saveMeta(meta);

      // Cleanup temp chunks (async, non-blocking)
      this.cleanupTransferDir(transferDir).catch(() => {});

      return meta;
    } catch (err) {
      if (meta.status !== 'failed') {
        meta.status = 'failed';
        meta.error = err instanceof Error ? err.message : 'Unknown error during finalization';
        meta.updatedAt = new Date().toISOString();
        await this.saveMeta(meta);
      }
      throw err;
    }
  }

  /**
   * Get transfer status
   */
  getTransferStatus(transferId: string): TransferStatusResponse | null {
    const meta = this.transfers.get(transferId);
    if (!meta) return null;

    return {
      id: meta.id,
      originalName: meta.originalName,
      totalSize: meta.totalSize,
      chunkSize: meta.chunkSize,
      totalChunks: meta.totalChunks,
      chunksReceived: meta.chunksReceived,
      bytesReceived: meta.bytesReceived,
      status: meta.status,
      missingChunks: this.getMissingChunks(meta),
      serverHash: meta.serverHash,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      completedAt: meta.completedAt,
      error: meta.error,
    };
  }

  /**
   * Cancel a transfer
   */
  async cancelTransfer(transferId: string, sessionId: string): Promise<boolean> {
    const meta = this.transfers.get(transferId);
    if (!meta) return false;
    if (meta.sessionId !== sessionId) throw new Error('Unauthorized');

    meta.status = 'cancelled';
    meta.updatedAt = new Date().toISOString();
    await this.saveMeta(meta);

    // Cleanup temp dir
    const transferDir = path.join(config.tempDir, transferId);
    this.cleanupTransferDir(transferDir).catch(() => {});

    return true;
  }

  /**
   * List all transfers, optionally filtered
   */
  listTransfers(options?: {
    status?: TransferStatus;
    sessionId?: string;
    limit?: number;
  }): TransferStatusResponse[] {
    let transfers = Array.from(this.transfers.values());

    if (options?.status) {
      transfers = transfers.filter((t) => t.status === options.status);
    }
    if (options?.sessionId) {
      transfers = transfers.filter((t) => t.sessionId === options.sessionId);
    }

    // Sort by most recent first
    transfers.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    if (options?.limit) {
      transfers = transfers.slice(0, options.limit);
    }

    return transfers.map((meta) => ({
      id: meta.id,
      originalName: meta.originalName,
      totalSize: meta.totalSize,
      chunkSize: meta.chunkSize,
      totalChunks: meta.totalChunks,
      chunksReceived: meta.chunksReceived,
      bytesReceived: meta.bytesReceived,
      status: meta.status,
      missingChunks: this.getMissingChunks(meta),
      serverHash: meta.serverHash,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      completedAt: meta.completedAt,
      error: meta.error,
    }));
  }

  /**
   * Get aggregate stats
   */
  getStats(): {
    totalUploads: number;
    activeTransfers: number;
    totalBytesUploaded: number;
  } {
    const all = Array.from(this.transfers.values());
    return {
      totalUploads: all.filter((t) => t.status === 'completed').length,
      activeTransfers: all.filter(
        (t) => t.status === 'pending' || t.status === 'uploading' || t.status === 'finalizing'
      ).length,
      totalBytesUploaded: all
        .filter((t) => t.status === 'completed')
        .reduce((sum, t) => sum + t.totalSize, 0),
    };
  }

  /** Get list of missing chunk indices */
  private getMissingChunks(meta: TransferMeta): number[] {
    const missing: number[] = [];
    for (let i = 0; i < meta.totalChunks; i++) {
      if (!meta.chunkBitmap[i]) missing.push(i);
    }
    return missing;
  }

  /** Persist transfer metadata to disk */
  private async saveMeta(meta: TransferMeta): Promise<void> {
    const metaPath = path.join(config.tempDir, meta.id, 'meta.json');
    // Ensure directory exists (might have been cleaned up)
    await fsp.mkdir(path.join(config.tempDir, meta.id), { recursive: true });
    await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2));
  }

  /** Sanitize a filename to prevent path traversal and remove unsafe characters */
  private sanitizeFilename(name: string): string {
    // Remove path components
    let safe = path.basename(name);
    // Remove null bytes and control characters
    safe = safe.replace(/[\x00-\x1f\x80-\x9f]/g, '');
    // Remove path traversal patterns
    safe = safe.replace(/\.\./g, '');
    // Remove or replace unsafe characters
    safe = safe.replace(/[<>:"/\\|?*]/g, '_');
    // Trim whitespace and dots from start/end
    safe = safe.replace(/^[\s.]+|[\s.]+$/g, '');
    // Limit length
    if (safe.length > 200) {
      const ext = path.extname(safe);
      safe = safe.substring(0, 200 - ext.length) + ext;
    }
    return safe || 'unnamed_file';
  }

  /** Ensure filename is unique in the uploads directory */
  private ensureUniqueFilename(name: string): string {
    // Check if any existing transfer uses this name
    for (const meta of this.transfers.values()) {
      if (meta.safeName === name && meta.status !== 'cancelled' && meta.status !== 'failed') {
        const ext = path.extname(name);
        const base = path.basename(name, ext);
        const timestamp = Date.now().toString(36);
        return `${base}_${timestamp}${ext}`;
      }
    }
    return name;
  }

  /** Check available disk space */
  private async checkDiskSpace(requiredBytes: number): Promise<void> {
    try {
      const stats = await fsp.statfs(config.storageDir);
      const availableBytes = stats.bavail * stats.bsize;
      // Need at least the file size + 10% overhead for chunks and metadata
      const needed = Math.ceil(requiredBytes * 1.1);
      if (availableBytes < needed) {
        const availableGB = (availableBytes / (1024 * 1024 * 1024)).toFixed(1);
        const neededGB = (needed / (1024 * 1024 * 1024)).toFixed(1);
        throw new Error(
          `Insufficient disk space. Available: ${availableGB} GB, needed: ${neededGB} GB`
        );
      }
    } catch (err) {
      // If statfs is not available (older Node), skip the check
      if (err instanceof Error && err.message.includes('Insufficient')) throw err;
    }
  }

  /** Remove temporary chunk directory */
  private async cleanupTransferDir(dirPath: string): Promise<void> {
    try {
      await fsp.rm(dirPath, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }
}

export const transferService = new TransferService();
