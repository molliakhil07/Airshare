import hostRoutes from './routes/host.routes.js';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';

import {
  config,
  getPrimaryAddress,
  getLocalAddresses,
} from './config/index.js';

import { hostAuthService } from './services/host-auth.service.js';
import { transferService } from './services/transfer.service.js';
import { shareService } from './services/share.service.js';

import pairRoutes from './routes/pair.routes.js';
import transferRoutes from './routes/transfer.routes.js';
import shareRoutes from './routes/share.routes.js';

import { errorHandler } from './middleware/index.js';

const app = express();

app.use('/api/host', hostRoutes);

// Security headers while allowing local-network file transfers.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);

// Preserve the current CORS behavior for the existing phone workflow.
// We will tighten dashboard/bootstrap access separately.
app.use(
  cors({
    origin: true,
    credentials: true,
    exposedHeaders: [
      'Content-Range',
      'Accept-Ranges',
      'Content-Length',
      'Content-Disposition',
    ],
  })
);

// Parse JSON for non-chunk endpoints.
app.use(
  express.json({
    limit: config.maxBodySize,
    type: (req) => {
      if (req.url?.includes('/chunks/')) return false;
      return req.headers['content-type']?.includes('json') ?? false;
    },
  })
);

// Health check.
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    name: 'AirShare',
    version: '1.0.0',
    uptime: process.uptime(),
  });
});

// Existing API routes.
app.use('/api/pair', pairRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/shares', shareRoutes);

// Stats endpoint.
app.get('/api/stats', (_req, res) => {
  const transferStats = transferService.getStats();
  const shares = shareService.listShares();

  res.json({
    success: true,
    data: {
      ...transferStats,
      activeShares: shares.length,
      totalDownloads: shares.reduce(
        (sum, share) => sum + share.downloadCount,
        0
      ),
      uptime: Math.floor(process.uptime()),
    },
  });
});

// Serve the React client in production.
const clientDistPath =
  process.env.AIRBRIDGE_CLIENT_DIST ||
  path.join(process.cwd(), '..', 'client', 'dist');

app.use(express.static(clientDistPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    next();
    return;
  }

  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).json({
        message:
          'AirShare API is running. Client dev server is at http://localhost:5173',
      });
    }
  });
});

// Error handler.
app.use(errorHandler);

// Start server.
async function start(): Promise<void> {
  // Initialize local installation authentication before accepting requests.
  await hostAuthService.ready();

  // Initialize existing services.
  await transferService.ready();
  await shareService.ready();

  app.listen(config.port, config.host, () => {
    const primary = getPrimaryAddress();
    const addresses = getLocalAddresses();
    const url = `http://${primary}:${config.port}`;

    console.log('');
    console.log('â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—');
    console.log('â•‘                                                          â•‘');
    console.log('â•‘       âœˆ  AirBridge â€” Wireless File Transfer              â•‘');
    console.log('â•‘                                                          â•‘');
    console.log('â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£');
    console.log(`â•‘  Server running on port ${String(config.port).padEnd(32)}â•‘`);
    console.log('â•‘                                                          â•‘');
    console.log('â•‘  Access URLs:                                            â•‘');
    console.log(`â•‘  â†’ ${url.padEnd(54)}â•‘`);

    for (const address of addresses) {
      const addressUrl = `http://${address.address}:${config.port}`;
      console.log(
        `â•‘    ${`${address.name}: ${addressUrl}`.padEnd(56)}â•‘`
      );
    }

    console.log('â•‘                                                          â•‘');
    console.log('â•‘  Open the server URL on your phone to start transferring â•‘');
    console.log('â•‘                                                          â•‘');
    console.log(`â•‘  Storage: ${config.storageDir.substring(0, 48).padEnd(48)}â•‘`);
    console.log('â•‘                                                          â•‘');
    console.log('â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
    console.log('');
    console.log('Host authentication initialized for this installation.');
  });
}

start().catch((error) => {
  console.error('Failed to start AirShare server:', error);
  process.exit(1);
});

export default app;
