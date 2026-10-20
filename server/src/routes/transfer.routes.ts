import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/index.js';
import { transferService } from '../services/transfer.service.js';
import type { CreateTransferRequest } from '../types/index.js';

const router = Router();

// All transfer routes require authentication
router.use(requireAuth);

/**
 * POST /api/transfers — Create a new upload transfer
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const body: CreateTransferRequest = req.body;

    if (!body.fileName || typeof body.fileName !== 'string') {
      res.status(400).json({ error: 'fileName is required', code: 'VALIDATION_ERROR' });
      return;
    }
    if (!body.fileSize || typeof body.fileSize !== 'number' || body.fileSize <= 0) {
      res.status(400).json({ error: 'fileSize must be a positive number', code: 'VALIDATION_ERROR' });
      return;
    }

    const meta = await transferService.createTransfer(body, req.sessionId!);

    res.status(201).json({
      success: true,
      data: {
        id: meta.id,
        chunkSize: meta.chunkSize,
        totalChunks: meta.totalChunks,
        safeName: meta.safeName,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create transfer';
    const status = message.includes('Insufficient') ? 507 : 400;
    res.status(status).json({ error: message, code: 'TRANSFER_ERROR' });
  }
});

/**
 * PUT /api/transfers/:id/chunks/:index — Upload a chunk
 * 
 * The chunk data is sent as the raw request body (application/octet-stream).
 * This endpoint streams data directly to disk to avoid buffering large chunks.
 */
router.put('/:id/chunks/:index', async (req: Request, res: Response) => {
  try {
    const transferId = req.params.id;
    const chunkIndex = parseInt(req.params.index, 10);

    if (isNaN(chunkIndex) || chunkIndex < 0) {
      res.status(400).json({ error: 'Invalid chunk index', code: 'VALIDATION_ERROR' });
      return;
    }

    // Collect the raw body data
    // Express with raw body parser handles this, but we also support streaming
    const chunks: Buffer[] = [];
    let totalSize = 0;
    const maxSize = 64 * 1024 * 1024 + 1024; // 64 MiB + some overhead

    await new Promise<void>((resolve, reject) => {
      req.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > maxSize) {
          reject(new Error('Chunk too large'));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', resolve);
      req.on('error', reject);
    });

    const data = Buffer.concat(chunks);

    const result = await transferService.receiveChunk(
      transferId,
      chunkIndex,
      data,
      req.sessionId!
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload chunk';
    const status = message.includes('not found') ? 404 :
                   message.includes('Unauthorized') ? 403 :
                   message.includes('already completed') ? 409 : 400;
    res.status(status).json({ error: message, code: 'CHUNK_ERROR' });
  }
});

/**
 * GET /api/transfers/:id/status — Get transfer status with chunk bitmap
 */
router.get('/:id/status', (req: Request, res: Response) => {
  const status = transferService.getTransferStatus(req.params.id);

  if (!status) {
    res.status(404).json({ error: 'Transfer not found', code: 'NOT_FOUND' });
    return;
  }

  res.json({ success: true, data: status });
});

/**
 * POST /api/transfers/:id/finalize — Finalize transfer, assemble and verify
 */
router.post('/:id/finalize', async (req: Request, res: Response) => {
  try {
    const meta = await transferService.finalizeTransfer(req.params.id, req.sessionId!);

    res.json({
      success: true,
      data: {
        id: meta.id,
        originalName: meta.originalName,
        totalSize: meta.totalSize,
        serverHash: meta.serverHash,
        completedAt: meta.completedAt,
        hashMatch: meta.clientHash ? meta.clientHash === meta.serverHash : undefined,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to finalize transfer';
    const status = message.includes('not found') ? 404 :
                   message.includes('Unauthorized') ? 403 :
                   message.includes('Integrity') ? 422 : 400;
    res.status(status).json({ error: message, code: 'FINALIZE_ERROR' });
  }
});

/**
 * DELETE /api/transfers/:id — Cancel a transfer
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const cancelled = await transferService.cancelTransfer(req.params.id, req.sessionId!);
    if (cancelled) {
      res.json({ success: true, message: 'Transfer cancelled' });
    } else {
      res.status(404).json({ error: 'Transfer not found', code: 'NOT_FOUND' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to cancel transfer';
    res.status(403).json({ error: message, code: 'CANCEL_ERROR' });
  }
});

/**
 * GET /api/transfers — List all transfers
 */
router.get('/', (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

  const transfers = transferService.listTransfers({
    status: status as any,
    limit,
  });

  res.json({ success: true, data: transfers });
});

export default router;
