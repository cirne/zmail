import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { config } from "~/lib/config";
import { logger } from "~/lib/logger";
import { SCHEMA } from "./schema";

export type SqliteDatabase = InstanceType<typeof Database>;

let _db: SqliteDatabase | null = null;

export function getDb(): SqliteDatabase {
  if (_db) return _db;

  mkdirSync(dirname(config.dbPath), { recursive: true });

  _db = new Database(config.dbPath);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");
  _db.exec("PRAGMA synchronous = NORMAL");
  // Allow wait up to 15s for lock (workers and sync share the DB; avoids "database is locked")
  _db.exec("PRAGMA busy_timeout = 15000");

  _db.exec(SCHEMA);

  // Ensure singleton status rows exist
  _db.exec(
    "INSERT OR IGNORE INTO sync_summary (id, total_messages) VALUES (1, 0)"
  );
  _db.exec(
    "INSERT OR IGNORE INTO indexing_status (id) VALUES (1)"
  );

  logger.debug("Database opened", { path: config.dbPath });
  return _db;
}

export function closeDb() {
  _db?.close();
  _db = null;
}
