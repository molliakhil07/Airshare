/**
 * AirShare Upload Engine
 * 
 * Handles chunked file uploads with:
 * - Memory-bounded streaming (never loads full file)
 * - Resumable uploads via chunk bitmap
 * - Speed measurement and ETA calculation
 * - Retry with exponential backoff
 * - Cancellation support
 * - Queue management for batch uploads
 */

import { createTransfer, uploadChunk, finalizeTransfer, getTransferStatus, cancelTransfer } from './api';
import type { QueuedFile } from '../types';

/** Default chunk size: 8 MiB */
const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;

/** Max retries per chunk */
const MAX_RETRIES = 3;

/** Base retry delay in ms */
const RETRY_BASE_DELAY = 1000;

/** Speed measurement window (last N samples) */
const SPEED_WINDOW = 10;

export type UploadProgressCallback = (file: QueuedFile) => void;
export type UploadCompleteCallback = (file: QueuedFile) => void;
export type UploadErrorCallback = (file: QueuedFile, error: Error) => void;

interface UploadCallbacks {
  onProgress: UploadProgressCallback;
  onComplete: UploadCompleteCallback;
  onError: UploadErrorCallback;
}

/** Active upload controller (for cancellation) */
const activeUploads = new Map<string, AbortController>();

/**
 * Upload a single file in chunks
 */
export async function uploadFile(
  queuedFile: QueuedFile,
  callbacks: UploadCallbacks,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<void> {
  const { file } = queuedFile;
  const controller = new AbortController();
  activeUploads.set(queuedFile.id, controller);

  try {
    // Step 1: Create the transfer on the server
    queuedFile.status = 'uploading';
    queuedFile.startTime = Date.now();
    callbacks.onProgress(queuedFile);

    const transfer = await createTransfer({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      chunkSize,
    });

    queuedFile.transferId = transfer.id;
    queuedFile.totalChunks = transfer.totalChunks;

    // Step 2: Check for existing chunks (resume support)
    let missingChunks: number[] = [];
    try {
      const status = await getTransferStatus(transfer.id);
      missingChunks = status.missingChunks;
      queuedFile.chunksUploaded = status.chunksReceived;
      queuedFile.bytesUploaded = status.bytesReceived;
    } catch {
      // No existing chunks, upload all
      missingChunks = Array.from({ length: transfer.totalChunks }, (_, i) => i);
    }

    // Step 3: Upload each missing chunk
    const speedSamples: number[] = [];
    let lastProgressTime = Date.now();
    let lastProgressBytes = queuedFile.bytesUploaded;

    for (const chunkIndex of missingChunks) {
      // Check for cancellation
      if (controller.signal.aborted) {
        queuedFile.status = 'cancelled';
        callbacks.onProgress(queuedFile);
        return;
      }

      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunkBlob = file.slice(start, end);

      // Read the chunk into an ArrayBuffer (bounded memory â€” only one chunk at a time)
      const chunkData = await chunkBlob.arrayBuffer();

      // Upload with retries
      let uploaded = false;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < MAX_RETRIES && !uploaded; attempt++) {
        if (controller.signal.aborted) {
          queuedFile.status = 'cancelled';
          callbacks.onProgress(queuedFile);
          return;
        }

        try {
          await uploadChunk(transfer.id, chunkIndex, chunkData);
          uploaded = true;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < MAX_RETRIES - 1) {
            // Exponential backoff
            const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }

      if (!uploaded) {
        throw lastError || new Error(`Failed to upload chunk ${chunkIndex}`);
      }

      // Update progress
      queuedFile.chunksUploaded++;
      queuedFile.bytesUploaded += end - start;
      queuedFile.progress = (queuedFile.bytesUploaded / file.size) * 100;

      // Calculate speed
      const now = Date.now();
      const elapsed = (now - lastProgressTime) / 1000;
      if (elapsed > 0) {
        const bytesInInterval = queuedFile.bytesUploaded - lastProgressBytes;
        const speed = bytesInInterval / elapsed;
        speedSamples.push(speed);
        if (speedSamples.length > SPEED_WINDOW) speedSamples.shift();
        queuedFile.speed = speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length;
        lastProgressTime = now;
        lastProgressBytes = queuedFile.bytesUploaded;
      }

      // Calculate ETA
      if (queuedFile.speed > 0) {
        const remaining = file.size - queuedFile.bytesUploaded;
        queuedFile.eta = remaining / queuedFile.speed;
      }

      callbacks.onProgress(queuedFile);
    }

    // Step 4: Finalize the transfer
    queuedFile.status = 'finalizing';
    callbacks.onProgress(queuedFile);

    const result = await finalizeTransfer(transfer.id);
    queuedFile.serverHash = result.serverHash;
    queuedFile.status = 'completed';
    queuedFile.progress = 100;
    queuedFile.eta = 0;

    callbacks.onComplete(queuedFile);
  } catch (err) {
    queuedFile.status = 'failed';
    queuedFile.error = err instanceof Error ? err.message : 'Upload failed';
    callbacks.onError(queuedFile, err instanceof Error ? err : new Error(String(err)));
  } finally {
    activeUploads.delete(queuedFile.id);
  }
}

/**
 * Cancel an active upload
 */
export function cancelUpload(queuedFileId: string): void {
  const controller = activeUploads.get(queuedFileId);
  if (controller) {
    controller.abort();
  }
}

/**
 * Upload multiple files with queue management
 */
export async function uploadBatch(
  files: QueuedFile[],
  callbacks: UploadCallbacks,
  concurrency: number = 1,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<void> {
  const queue = [...files];
  const active: Promise<void>[] = [];

  while (queue.length > 0 || active.length > 0) {
    // Start uploads up to concurrency limit
    while (queue.length > 0 && active.length < concurrency) {
      const file = queue.shift()!;
      const promise = uploadFile(file, callbacks, chunkSize).then(() => {
        const idx = active.indexOf(promise);
        if (idx >= 0) active.splice(idx, 1);
      });
      active.push(promise);
    }

    // Wait for at least one to complete
    if (active.length > 0) {
      await Promise.race(active);
    }
  }
}

/**
 * Create a QueuedFile from a File object
 */
export function createQueuedFile(file: File): QueuedFile {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    file,
    status: 'pending',
    progress: 0,
    bytesUploaded: 0,
    totalChunks: 0,
    chunksUploaded: 0,
    speed: 0,
    eta: 0,
  };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

/**
 * Format seconds to human-readable duration
 */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return '--';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.ceil(seconds % 60);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

/**
 * Format speed in MB/s
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return '--';
  if (bytesPerSecond < 1024 * 1024) {
    return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  }
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}
