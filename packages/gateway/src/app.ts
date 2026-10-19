import { Hono } from 'hono';
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
import { adminMeRoutes } from './routes/admin/me.js';
import { adminCouponRoutes } from './routes/admin/coupons.js';
import { adminOverviewRoutes } from './routes/admin/overview.js';
import { adminUserRoutes } from './routes/admin/users.js';
import { adminSubscriptionRoutes } from './routes/admin/subscriptions.js';
import { adminPoolRoutes } from './routes/admin/pool.js';
import { adminSystemRoutes } from './routes/admin/system.js';
import { userCouponRoutes } from './routes/user/coupons.js';
import { userMeRoutes } from './routes/user/me.js';
import { userUsageRoutes } from './routes/user/usage.js';
import { userPoolRoutes } from './routes/user/pool.js';
import { userKitRoutes } from './routes/user/kits.js';
import { publicKitRoutes } from './routes/public/kits.js';
import { userAuthMiddleware } from './auth/user.js';
import { authMiddleware } from './middleware/auth.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { loggerMiddleware, logger } from './middleware/logger.js';
import { corsMiddleware } from './middleware/cors.js';

import { AppEnv } from './types/index.js';

export const app = new Hono<AppEnv>();

// Global middleware
app.use('*', corsMiddleware);

app.use('*', requestIdMiddleware);
app.use('*', loggerMiddleware);

// Public routes (no auth)
app.route('/v1/health', healthRoutes);
app.route('/public/kits', publicKitRoutes);

// Authenticated v1 routes (project API key)
app.use('/v1/*', authMiddleware);
app.route('/v1/chat', chatRoutes);
app.route('/v1/models', modelsRoutes);
app.route('/v1/usage', usageRoutes);

// Admin routes (ADMIN_API_KEY or an allowlisted Clerk session)
app.use('/admin/*', authMiddleware);
app.route('/admin/providers', adminProviderRoutes);
app.route('/admin/credentials', adminCredentialRoutes);
app.route('/admin/projects', adminProjectRoutes);
app.route('/admin/api-keys', adminApiKeyRoutes);
app.route('/admin/analytics', adminAnalyticsRoutes);
app.route('/admin/audit-logs', adminAuditRoutes);
app.route('/admin/me', adminMeRoutes);
app.route('/admin/coupons', adminCouponRoutes);
// Admin panel (/admin in the dashboard)
app.route('/admin/overview', adminOverviewRoutes);
app.route('/admin/users', adminUserRoutes);
app.route('/admin/subscriptions', adminSubscriptionRoutes);
app.route('/admin/pool', adminPoolRoutes);
app.route('/admin/system', adminSystemRoutes);

// User routes (any signed-in Clerk user; each user only sees their own data)
app.use('/user/*', userAuthMiddleware());
app.route('/user/pool', userPoolRoutes);
app.route('/user/kits', userKitRoutes);
app.route('/user/coupons', userCouponRoutes);
app.route('/user/me', userMeRoutes);
app.route('/user/usage', userUsageRoutes);

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
