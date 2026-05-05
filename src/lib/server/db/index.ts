import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const databasePath = process.env.BRAIN_DB_PATH ?? './brain.db';
const client = new Database(databasePath);

// Enable WAL mode for better concurrent read performance
client.pragma('journal_mode = WAL');

export const db = drizzle(client, { schema });
