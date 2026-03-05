# zmail

Email as a queryable dataset for AI agents.

Modern email systems are human-first — designed around inbox browsing and manual workflows. **zmail** reimagines email as a structured, searchable dataset with a native interface for AI agents.

## What it does

- Syncs email from Gmail (and any IMAP provider) to a local indexed store
- Exposes a native CLI and MCP server for agent tool access
- Enables natural language queries over your full email history and attachments
- Extracts and indexes attachment content (PDF, DOCX, XLSX, and more)

```bash
zmail search "contract from kirsten last month"
zmail thread th_8473
zmail attachments read att_291   # returns PDF content as markdown
```

## Quick start (local hello world)

**What’s in place today:** Config (env), SQLite DB + schema + FTS5, CLI (`sync` / `search` / `thread` / `message` / `mcp`), web UI (Hono), MCP server (stdio when you run `zmail mcp`), and sync/provider scaffolding. **IMAP sync is not yet implemented** — `bun run sync` only logs; no mail is fetched until the sync engine is built.

1. **Install and env**
   ```bash
   bun install
   cp .env.example .env
   ```

2. **Gmail app password**  
   Use a [Gmail app password](https://support.google.com/accounts/answer/185833) (not an OAuth API key). In `.env`:
   ```bash
   IMAP_USER=your@gmail.com
   IMAP_PASSWORD=xxxx-xxxx-xxxx-xxxx   # 16-char app password
   ```
   Leave `IMAP_HOST=imap.gmail.com` and `IMAP_PORT=993` as in `.env.example`.

3. **Run**
   ```bash
   bun run dev      # web UI at http://localhost:3000 + background sync (stub)
   # or
   bun run sync     # run sync only (stub)
   ```
   CLI (against empty DB until sync is implemented):
   ```bash
   bun run src/cli/index.ts search "hello"
   bun run src/cli/index.ts thread some-id
   ```
   Or build and run the binary: `bun run build` then `./dist/zmail search "hello"`.

## Architecture

Built with TypeScript + Bun. All data stored locally on a persistent volume — no cloud sync service, no third-party access to your email. Storage layout and technical decisions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Product vision: [`docs/VISION.md`](docs/VISION.md).

## Status

Early development. IMAP sync is stubbed; DB, CLI, web, and MCP are in place. Not yet ready for general use.

## License

MIT
