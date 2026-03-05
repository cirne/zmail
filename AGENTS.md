# zmail — Agent Guide

**zmail** is an agent-first email system. It syncs email from IMAP providers, indexes it locally, and exposes it as a queryable dataset via a CLI binary and MCP server.

## Key documents

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — technical decisions and rationale (**read before making storage, sync, or interface decisions**)
- [`docs/VISION.md`](docs/VISION.md) — product vision
- [`docs/OPPORTUNITIES.md`](docs/OPPORTUNITIES.md) — product improvement ideas
- [`.env.example`](.env.example) — canonical list of environment variables

**Single source of truth:** each fact lives in one place. Update the canonical docs or code not copies. DRY.

## Tech stack

Bun, TypeScript, Hono, SQLite (`bun:sqlite`), FTS5, LanceDB, imapflow, HTMX. Compiles to a native binary via `bun build --compile`.

## Project structure

```
src/
  cli/          entrypoint and subcommands
  sync/         IMAP sync engine
  db/           SQLite schema, queries
  search/       FTS5 and semantic search
  attachments/  document extraction → markdown
  mcp/          MCP server tools
  web/          Hono web UI (HTMX)
  lib/          shared utilities
```

## Development rules

- Never commit email data, credentials, or `.db` files.
- **No migrations.** Schema is applied on DB creation. For schema changes: run manual `ALTER TABLE` / SQL against the live DB to save a resync. Full reset (`rm -rf ~/.zmail/data/` + resync) also works. Do not create or maintain migration files.
- When testing search, **use the standard search interface** (`search(db, { query })` from `~/search` or the web route). Do not query the DB directly unless debugging or explicitly asked.

## Commands

```bash
bun install
bun run dev          # web UI + MCP server (port 3000), starts background sync
bun run sync         # sync only (or: bun run src/index.ts sync --since 7d)
bun run build        # compile native binary
bun run install-cli  # build + copy binary to ~/.local/bin (or ZMAIL_INSTALL_DIR) for testing from another dir
bun run lint         # tsc --noEmit (no ESLint)
bun test             # run test suite
```

**CLI help and onboarding (no env required):** `zmail --help`, `zmail -h`, `zmail help` show usage; `zmail setup` shows full setup instructions. If any command fails due to missing required env, the CLI prints the error and the full setup instructions (see `src/lib/onboarding.ts`).

## Environment variables
First, check whether these required variables are already present in the current environment:

```
IMAP_USER=you@gmail.com
IMAP_PASSWORD=your-16-char-app-password
OPENAI_API_KEY=sk-...
```

If one or more are missing, set up a local `.env` file from the example:

1. Copy `.env.example` to `.env` (if `.env` does not already exist).
2. Fill in any missing required values.

If all required variables are already present (for example in Cursor Cloud, CI, or other preconfigured environments), do **not** create or modify `.env`.
