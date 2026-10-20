import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { config, getPrimaryAddress, getLocalAddresses } from './config/index.js';
import { transferService } from './services/transfer.service.js';
import { shareService } from './services/share.service.js';
import pairRoutes from './routes/pair.routes.js';
import transferRoutes from './routes/transfer.routes.js';
import shareRoutes from './routes/share.routes.js';
import { errorHandler } from './middleware/index.js';

const app = express();

// Security headers (but allow local network access)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // Allow embedded QR code images
  })
);

// CORS — allow requests from any origin on the local network
app.use(
  cors({
    origin: true, // reflect request origin
    credentials: true,
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Disposition'],
  })
);

// Parse JSON for non-chunk endpoints (small bodies only)
app.use(
  express.json({
    limit: config.maxBodySize,
    // Skip JSON parsing for chunk upload paths
    type: (req) => {
      if (req.url?.includes('/chunks/')) return false;
      return req.headers['content-type']?.includes('json') ?? false;
    },
  })
);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    name: 'AirBridge',
    version: '1.0.0',
    uptime: process.uptime(),
  });
});

// Routes
app.use('/api/pair', pairRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/shares', shareRoutes);

// Stats endpoint
app.get('/api/stats', (_req, res) => {
  const transferStats = transferService.getStats();
  const shares = shareService.listShares();

  res.json({
    success: true,
    data: {
      ...transferStats,
      activeShares: shares.length,
      totalDownloads: shares.reduce((sum, s) => sum + s.downloadCount, 0),
      uptime: Math.floor(process.uptime()),
    },
  });
});

// Serve the React client in production
const clientDistPath = path.join(process.cwd(), '..', 'client', 'dist');
app.use(express.static(clientDistPath));
app.get('*', (req, res, next) => {
  // Only serve index.html for non-API routes
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      // In development, the client runs on its own dev server
      res.status(200).json({
        message: 'AirBridge API is running. Client dev server is at http://localhost:5173',
      });
    }
  });
});

// Error handler
app.use(errorHandler);

// Start server
async function start(): Promise<void> {
  // Initialize services
  await transferService.ready();
  await shareService.ready();

  app.listen(config.port, config.host, () => {
    const primary = getPrimaryAddress();
    const addresses = getLocalAddresses();
    const url = `http://${primary}:${config.port}`;

    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║                                                      ║');
    console.log('║       ✈  AirBridge — Wireless File Transfer          ║');
    console.log('║                                                      ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  Server running on port ${config.port}                         ║`);
    console.log('║                                                      ║');
    console.log('║  Access URLs:                                        ║');
    console.log(`║  → ${url.padEnd(48)} ║`);
    for (const addr of addresses) {
      const addrUrl = `http://${addr.address}:${config.port}`;
      console.log(`║    ${addr.name}: ${addrUrl.padEnd(38)} ║`);
    }
    console.log('║                                                      ║');
    console.log('║  Open this URL on your phone to start transferring   ║');
    console.log('║                                                      ║');
    console.log('║  Storage: ' + config.storageDir.substring(0, 42).padEnd(42) + '  ║');
    console.log('║                                                      ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
  });
}

start().catch((err) => {
  console.error('Failed to start AirBridge server:', err);
  process.exit(1);
});

export default app;
