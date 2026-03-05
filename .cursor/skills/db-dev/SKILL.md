---
name: db-dev
description: Reset and manage the local SQLite database and data dir at dev time. Use when the user or agent needs to blow away local data, reset the DB after schema changes, or start fresh. No migrations; rebuild from scratch.
---

# Local DB management (dev time)

## Principle

**No migrations.** Schema is applied when the DB is created. To pick up schema changes or fix bad state, delete the data and let the app recreate everything on next run.

## Where data lives

- **Root:** `DATA_DIR` (default `./data`). Canonical list: `.env.example` (see AGENTS.md).
- **DB:** `DATA_DIR/zmail.db` (and WAL files `-shm`, `-wal`).
- **Maildir:** `DATA_DIR/maildir/` (raw .eml in `cur/`, `new/`, `tmp/`).
- **Sync state:** Stored inside the DB (`sync_state`, `sync_summary`).

## Reset commands

**Full reset (preferred when blowing away corrupt or DB-dependent data):**

Deletes the DB and all filesystem data under `DATA_DIR` (maildir, WAL files, etc.). Use this whenever the DB is being replaced so that nothing on disk is left that depends on the old DB (e.g. maildir `.eml` paths referenced by `messages.raw_path`, or orphaned files).

```bash
rm -rf data/
```

**DB only** (keeps maildir; use only when DB is bad but maildir is known good):

```bash
rm -f data/zmail.db data/zmail.db-shm data/zmail.db-wal
```

After either, the next run that uses the DB (e.g. `bun run sync` or `zmail search`) will create a new DB and apply the current schema. First sync after a full reset is full; later syncs are incremental.

## When to reset

- After **schema changes** (new/removed columns or tables) → **full reset** so no old maildir/state depends on the old schema.
- **Corrupt or stuck state** (e.g. sync_summary.is_running stuck, bad data) → **full reset** so filesystem and DB are consistent.
- **Fresh start** for testing or demos → full reset.

## Do not

- Add one-off migrations or `ALTER TABLE` in app code. Schema is defined in `src/db/schema.ts`; new DBs get it. Existing DBs are replaced by deleting them.
