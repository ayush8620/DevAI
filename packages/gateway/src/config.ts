import { z } from 'zod';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from monorepo root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
// Also try package-local .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// Also try monorepo root (from workspace root)
dotenv.config();

const configSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  MASTER_ENCRYPTION_KEY: z.string().min(32, 'MASTER_ENCRYPTION_KEY must be at least 32 hex chars (64 chars for 256-bit key)'),
  ADMIN_API_KEY: z.string().min(1, 'ADMIN_API_KEY is required'),
  GATEWAY_PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ALLOWED_ORIGINS: z.string().optional(),
  // Optional Clerk sign-in for the admin API (see README "Clerk sign-in").
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_JWT_KEY: z.string().optional(),
  ADMIN_EMAILS: z.string().optional(),
  ADMIN_USER_IDS: z.string().optional(),
});

export const config = configSchema.parse(process.env);
