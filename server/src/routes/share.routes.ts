import { Router } from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { requireAuth } from '../middleware/index.js';
import { shareService } from '../services/share.service.js';

const router = Router();

// All share routes require authentication
router.use(requireAuth);

/**
 * POST /api/shares — Share a file from PC for download
 * Body: { filePath: string }
 * Note: This endpoint is only callable from the PC dashboard,
 * not from a phone session.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { filePath } = req.body;

    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ error: 'filePath is required', code: 'VALIDATION_ERROR' });
      return;
    }

    // Resolve and validate path
    const resolved = path.resolve(filePath);

    const share = await shareService.shareFile(resolved, req.sessionId!);

    res.status(201).json({
      success: true,
      data: {
        id: share.id,
        fileName: share.fileName,
        fileSize: share.fileSize,
        mimeType: share.mimeType,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to share file';
    res.status(400).json({ error: message, code: 'SHARE_ERROR' });
  }
});

/**
 * GET /api/shares — List shared files
 */
router.get('/', (_req: Request, res: Response) => {
  const shares = shareService.listShares();
  res.json({ success: true, data: shares });
});

/**
 * GET /api/shares/:id/download — Download a shared file
 * Supports HTTP Range requests for resumable downloads
 */
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const share = shareService.getShare(req.params.id);
    if (!share) {
      res.status(404).json({ error: 'Share not found', code: 'NOT_FOUND' });
      return;
    }

    const rangeHeader = req.headers.range;
    let range: { start: number; end: number } | undefined;

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : share.fileSize - 1;

        if (start >= share.fileSize || end >= share.fileSize || start > end) {
          res.status(416).json({ error: 'Range not satisfiable', code: 'RANGE_ERROR' });
          return;
        }

        range = { start, end };
      }
    }

    const { stream, start, end, total } = shareService.createDownloadStream(share, range);

    // Set appropriate headers
    const contentLength = end - start + 1;

    res.setHeader('Content-Type', share.mimeType);
    res.setHeader('Content-Length', contentLength);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(share.fileName)}"`);

    if (range) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    }

    // Track download
    await shareService.recordDownload(share.id);

    // Stream the file to the response
    stream.pipe(res);

    stream.on('error', (err) => {
      console.error(`Download stream error for share ${share.id}:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed', code: 'STREAM_ERROR' });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Download failed';
    res.status(500).json({ error: message, code: 'DOWNLOAD_ERROR' });
  }
});

/**
 * GET /api/shares/:id — Get share info
 */
router.get('/:id', (req: Request, res: Response) => {
  const share = shareService.getShare(req.params.id);
  if (!share) {
    res.status(404).json({ error: 'Share not found', code: 'NOT_FOUND' });
    return;
  }

  res.json({
    success: true,
    data: {
      id: share.id,
      fileName: share.fileName,
      fileSize: share.fileSize,
      mimeType: share.mimeType,
      hash: share.hash,
      createdAt: share.createdAt,
      downloadCount: share.downloadCount,
    },
  });
});

/**
 * DELETE /api/shares/:id — Remove a share
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const removed = await shareService.removeShare(req.params.id, req.sessionId!);
    if (removed) {
      res.json({ success: true, message: 'Share removed' });
    } else {
      res.status(404).json({ error: 'Share not found', code: 'NOT_FOUND' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove share';
    res.status(403).json({ error: message, code: 'REMOVE_ERROR' });
  }
});

export default router;
