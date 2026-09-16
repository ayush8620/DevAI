import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { chatRoutes } from './routes/v1/chat.js';
import { modelsRoutes } from './routes/v1/models.js';
import { healthRoutes } from './routes/v1/health.js';
import { usageRoutes } from './routes/v1/usage.js';
import { adminProviderRoutes } from './routes/admin/providers.js';
import { adminCredentialRoutes } from './routes/admin/credentials.js';
import { adminProjectRoutes } from './routes/admin/projects.js';
import { adminApiKeyRoutes } from './routes/admin/apiKeys.js';
import { adminAnalyticsRoutes } from './routes/admin/analytics.js';
import { adminAuditRoutes } from './routes/admin/audit.js';
import { authMiddleware } from './middleware/auth.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { loggerMiddleware, logger } from './middleware/logger.js';

import { AppEnv } from './types/index.js';

export const app = new Hono<AppEnv>();

// Global middleware
app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-Request-ID', 'X-Cache'],
  maxAge: 86400,
}));

app.use('*', requestIdMiddleware);
app.use('*', loggerMiddleware);

// Public routes (no auth)
app.route('/v1/health', healthRoutes);

// Authenticated v1 routes (project API key)
app.use('/v1/*', authMiddleware);
app.route('/v1/chat', chatRoutes);
app.route('/v1/models', modelsRoutes);
app.route('/v1/usage', usageRoutes);

// Admin routes (admin API key)
app.use('/admin/*', authMiddleware);
app.route('/admin/providers', adminProviderRoutes);
app.route('/admin/credentials', adminCredentialRoutes);
app.route('/admin/projects', adminProjectRoutes);
app.route('/admin/api-keys', adminApiKeyRoutes);
app.route('/admin/analytics', adminAnalyticsRoutes);
app.route('/admin/audit-logs', adminAuditRoutes);

// Global error handler
app.onError((err, c) => {
  const requestId = c.get('requestId') || 'unknown';
  logger.error({ err: err.message, requestId }, 'Unhandled error');
  
  return c.json({
    error: {
      type: 'server_error',
      message: 'An internal server error occurred.',
      request_id: requestId,
    }
  }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json({
    error: {
      type: 'not_found',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    }
  }, 404);
});
