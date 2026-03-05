import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { config } from "~/lib/config";
import { logger } from "~/lib/logger";
import { SCHEMA } from "./schema";

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;

  const mode = process.env.ZMAIL_DB_MODE ?? "file";
  if (mode === "memory") {
    _db = new Database(":memory:");
  } else {
    mkdirSync(dirname(config.dbPath), { recursive: true });
    _db = new Database(config.dbPath, { create: true });
  }
  _db.run("PRAGMA journal_mode = WAL");
  _db.run("PRAGMA foreign_keys = ON");
  _db.run("PRAGMA synchronous = NORMAL");
  // Allow wait up to 15s for lock (workers and sync share the DB; avoids "database is locked")
  _db.run("PRAGMA busy_timeout = 15000");

  _db.run(SCHEMA);

  // Ensure singleton status rows exist
  _db.run(
    "INSERT OR IGNORE INTO sync_summary (id, total_messages) VALUES (1, 0)"
  );
  _db.run(
    "INSERT OR IGNORE INTO indexing_status (id) VALUES (1)"
  );

  logger.debug("Database opened", { mode, path: mode === "memory" ? ":memory:" : config.dbPath });
  return _db;
}

export function closeDb() {
  _db?.close();
  _db = null;
}
