# zmail — Agent Guide

**zmail** is an agent-first email system. It syncs email from IMAP providers, indexes it locally, and exposes it as a queryable dataset via a CLI binary and MCP server.

## Key documents

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — technical decisions and rationale (**read before making storage, sync, or interface decisions**)
- [`docs/VISION.md`](docs/VISION.md) — product vision
- [`docs/OPPORTUNITIES.md`](docs/OPPORTUNITIES.md) — product improvement ideas

**Single source of truth:** each fact lives in one place. Update the canonical docs or code not copies. DRY.

## Tech stack

Bun, TypeScript, SQLite (`bun:sqlite`), FTS5, LanceDB, imapflow. Compiles to a native binary via `bun build --compile`.

## Project structure

```
src/
  cli/          entrypoint and subcommands
  sync/         IMAP sync engine
  db/           SQLite schema, queries
  search/       FTS5 and semantic search
  attachments/  document extraction → markdown
  mcp/          MCP server tools
  lib/          shared utilities
```

## Development rules

- Never commit email data, credentials, or `.db` files.
- **No migrations.** Schema is applied on DB creation. For schema changes: run manual `ALTER TABLE` / SQL against the live DB to save a resync. Full reset (`rm -rf ~/.zmail/data/` + resync) also works. Do not create or maintain migration files.
- When testing search, **use the standard search interface** (`search(db, { query })` from `~/search`). Do not query the DB directly unless debugging or explicitly asked.

## Commands

```bash
bun install
bun run dev          # starts background sync
bun run sync         # initial sync (or: bun run src/index.ts sync --since 7d)
bun run update       # update: fetch new messages (or: bun run src/index.ts update)
bun run build        # compile native binary
bun run install-cli  # build + copy binary to ~/.local/bin (or ZMAIL_INSTALL_DIR) for testing from another dir
bun run lint         # tsc --noEmit (no ESLint)
bun test             # run test suite
```

### Attachment commands

```bash
zmail attachment list <message_id>       # list attachments for a message (JSON)
zmail attachment read <attachment_id>     # extract attachment as markdown/CSV (stdout)
zmail attachment read <attachment_id> --raw  # output raw binary (pipe to file)
```

Supported formats: PDF, DOCX, XLSX, HTML, CSV, TXT. Extraction happens on first read and is cached in the DB.

**CLI help and onboarding (no env required):** `zmail --help`, `zmail -h`, `zmail help` show usage; `zmail setup` runs interactive setup. If any command fails due to missing config, the CLI prints "No config found. Run 'zmail setup' first."

## Configuration

zmail stores configuration in `~/.zmail/` (or `$ZMAIL_HOME` if set):

- `~/.zmail/config.json` — non-secret settings (IMAP host/port/user, sync settings)
- `~/.zmail/.env` — secrets (ZMAIL_IMAP_PASSWORD, ZMAIL_OPENAI_API_KEY)

Run `zmail setup` to interactively create these files. The setup command:

- Creates `~/.zmail/` if it doesn't exist
- Prompts for email, IMAP password, OpenAI API key, and sync settings
- Validates credentials (IMAP connection test, OpenAI API test) unless `--no-validate` is used
- On re-run, shows existing values as defaults

Optional environment variables:

- `ZMAIL_HOME` — override config directory (default: `~/.zmail`)

Required environment variables:

- `ZMAIL_IMAP_PASSWORD` — IMAP password
- `ZMAIL_OPENAI_API_KEY` (or `OPENAI_API_KEY`) — OpenAI API key