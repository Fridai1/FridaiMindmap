import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const client = new Database('./brain.db');

// Enable WAL mode for better concurrent read performance
client.pragma('journal_mode = WAL');

export const db = drizzle(client, { schema });
