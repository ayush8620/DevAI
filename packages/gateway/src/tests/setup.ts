// Vitest setup: load .env if present, then fill safe placeholders so unit tests
// can import modules that read config without real infrastructure.
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const defaults: Record<string, string> = {
  DATABASE_URL: 'postgresql://devai:devai@localhost:5432/devai',
  REDIS_URL: 'redis://localhost:6379',
  MASTER_ENCRYPTION_KEY: '0'.repeat(64),
  ADMIN_API_KEY: 'dvai_admin_test',
  NODE_ENV: 'test',
};
for (const [k, v] of Object.entries(defaults)) {
  if (!process.env[k]) process.env[k] = v;
}
