import { serve } from '@hono/node-server';
import { app } from './app.js';
import { config } from './config.js';
import { startHealthCheckWorker } from './services/health.js';
import { logger } from './middleware/logger.js';

// Start health check worker (every 60s)
startHealthCheckWorker(60000);

serve({ fetch: app.fetch, port: config.GATEWAY_PORT || 3000 }, (info) => {
  logger.info(`DevAI Gateway running on port ${info.port}`);
});
