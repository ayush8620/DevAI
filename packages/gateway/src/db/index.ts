import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { config } from '../config.js';
import * as schema from './schema/index.js';

// Neon's HTTP driver only works against Neon endpoints. For any other
// PostgreSQL (e.g. the docker-compose database) use node-postgres.
const isNeon = /\.neon\.tech|neon\.build/i.test(config.DATABASE_URL);

export const db = isNeon
  ? drizzleNeon(neon(config.DATABASE_URL), { schema })
  : drizzlePg(new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 }), { schema });

export { schema };
