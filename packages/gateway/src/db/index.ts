import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { config } from '../config.js';
import * as schema from './schema/index.js';

const sql = neon(config.DATABASE_URL);
export const db = drizzle(sql, { schema });

export { schema };
