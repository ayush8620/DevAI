import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { startHealthCheckWorker } from './services/health.js';
import { logger } from './middleware/logger.js';

// Start health check worker (every 60s)
startHealthCheckWorker(60000);

// Hosting platforms (Render, Railway, Fly...) provide PORT; fall back to GATEWAY_PORT locally.
const port = Number(process.env.PORT) || config.GATEWAY_PORT || 3001;

serve({ fetch: app.fetch, port }, (info) => {
  logger.info(`DevAI Gateway running on port ${info.port}`);
});
