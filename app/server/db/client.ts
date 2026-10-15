import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { count, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Config } from '../config';
import * as schema from './schema';
import { pages, projects, tags } from './schema';
import { seedIfEmpty, warnIfSystemPagesMissing } from './seed';

/** Includes `$client`, which lives on the `drizzle()` return value and not on the class type. */
export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

export function openDatabase(config: Config): AppDatabase {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(path.join(config.dataDir, 'media'), { recursive: true });

  const sqlite = new Database(path.join(config.dataDir, 'db.sqlite'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  const db = drizzle(sqlite, { schema });
  const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  migrate(db, { migrationsFolder });

  const seeded = seedIfEmpty(db);
  warnIfSystemPagesMissing(db);
  logSummary(db, config, seeded);
  return db;
}

function logSummary(db: AppDatabase, config: Config, seeded: boolean): void {
  const pageCount = db.select({ n: count() }).from(pages).get()?.n ?? 0;
  const projectCount = db.select({ n: count() }).from(projects).get()?.n ?? 0;
  const draftCount =
    db.select({ n: count() }).from(projects).where(eq(projects.published, false)).get()?.n ?? 0;
  const tagCount = db.select({ n: count() }).from(tags).get()?.n ?? 0;
  const dbPath = path.join(config.dataDir, 'db.sqlite');

  console.log(
    `[portfolio] database ${seeded ? 'seeded' : 'ready'} at ${dbPath} — ${pageCount} pages, ${projectCount} projects (${draftCount} drafts), ${tagCount} tags`,
  );
}
