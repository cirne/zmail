# First run — initial sync and outcomes

This doc records the first run (stub), the first successful sync, and fixes applied. Single place for "what was wrong, what we fixed" and current backlog.

**Date:** 2026-03-05

---

## Commands run

1. `bun run sync` — run IMAP sync (entrypoint: `src/sync/index.ts`)
2. `bun run src/index.ts search "test"` — CLI search after sync

---

## Outcomes

### Sync

- **Exit code:** 0 (success)
- **Logs:** `Sync starting` → `Sync complete` in &lt;1s
- **Reality:** No IMAP connection was made. No mail was fetched. Sync is a stub: `runSync()` only logs and returns. `GmailProvider` / `GenericImapProvider` are not invoked.
- **Data:** `data/` was not created by sync (sync never calls `getDb()` or touches maildir). The `data/` directory and `zmail.db` were created later when running the CLI `search` command, which calls `getDb()`.

### Search

- **Exit code:** 0
- **Output:** `[]` (empty array — no messages in DB)
- **Expected:** Empty until real sync populates the DB.

---

## Errors and failures (opportunities to fix)

### 1. Sync does not sync (stub)

- **What:** Sync reports “Sync complete” without fetching any mail.
- **Why:** `src/sync/index.ts` has no IMAP logic; `src/sync/providers.ts` has only TODO shells.
- **Improvement:** Implement minimal IMAP sync: connect with imapflow, fetch messages since `SYNC_FROM_DATE` from INBOX (or All Mail), write .eml to maildir and metadata to SQLite so search returns results.

### 2. No IMAP config validation on sync

- **What:** Sync can “succeed” even if `IMAP_USER` or `IMAP_PASSWORD` are missing or wrong. No fail-fast.
- **Why:** `runSync()` does not call `requireImapConfig()` (or equivalent) before running.
- **Improvement:** At start of `runSync()`, require IMAP config and validate (e.g. connect and disconnect, or at least presence of env). Log a clear error and exit non-zero if env is missing or connection fails.

### 3. CLI can fail with ENOENT (hono) if deps not installed

- **What:** Running `bun run src/index.ts search "test"` before `bun install` produced:  
  `error: ENOENT while resolving package 'hono' from '/Users/cirne/dev/zmail/src/web/index.ts'`
- **Why:** The main entrypoint `src/index.ts` has top-level imports of `~/web` and `~/sync`. So any CLI invocation loads the web stack and requires `hono`. The `sync` script runs only `src/sync/index.ts`, which does not import web, so sync can run without installing deps.
- **Improvement:** Either (a) document that `bun install` is required before any use of the main binary/CLI, or (b) restructure so CLI-only invocations don’t pull in the web server (e.g. CLI entrypoint that doesn’t import web until needed, or separate entrypoints). Quick start already says `bun install` first; first-run experience suggests making that very visible or lazy-loading web.

### 4. maildir not created by sync

- **What:** After “sync”, there is no `data/maildir/`. Maildir is only created when something writes mail (not yet implemented).
- **Improvement:** When implementing sync, ensure maildir (and cur/new/tmp) are created under `config.maildirPath` before writing .eml files. Document in ARCHITECTURE or code where the canonical layout lives.

---

## Summary

| Item                         | Status / Action                                      |
|-----------------------------|------------------------------------------------------|
| Sync runs without crashing  | Yes                                                  |
| Sync fetches mail           | No — stub only                                       |
| Search runs                 | Yes — returns `[]`                                   |
| DB created                 | Yes (on first CLI use that calls `getDb()`)          |
| maildir created            | No — sync doesn’t write yet                          |
| Bugs / improvements        | Implement sync; validate IMAP config; optional CLI deps/doc |

---

## First successful sync (after implementation)

**Date:** 2026-03-05 (same day)

Minimal IMAP sync was implemented and run:

- **Config:** `requireImapConfig()` at start; fail if `IMAP_USER` or `IMAP_PASSWORD` missing.
- **Flow:** Connect (imapflow), open INBOX, `search({ since: SYNC_FROM_DATE })`, `fetchAll` in batches of 50 with `source: true`, write raw to `data/maildir/cur/<uid>_<safe>.eml`, parse with mailparser, insert into `messages` + `threads`, update `sync_state` and `sync_summary`.
- **Result:** 94 messages synced (SYNC_FROM_DATE=2026-03-01), ~5.7s. Search returns real results (e.g. `zmail search "Golf"`).

**Remaining opportunities (from original list):**

- ~~Implement minimal IMAP sync~~ — done.
- ~~Validate IMAP config at start~~ — done (`requireImapConfig()`).
- ~~Ensure maildir created when sync runs~~ — done (`ensureMaildir()`).
- (Optional) Reduce imapflow debug logging (level 10/20) so sync output is less noisy.
- (Optional) CLI entrypoint / web deps: document or lazy-load so missing `bun install` is clearer.

---

## Next steps (backlog)

1. ~~Implement minimal IMAP sync~~ — done.
2. ~~Validate IMAP config at start~~ — done.
3. (Optional) Reduce imapflow verbosity for sync runs.
4. (Optional) Reduce or document CLI dependency on web.
5. Add more folders (e.g. [Gmail]/All Mail per ADR-011), windowed sync (ADR-013), parallelism (ADR-017).
