/**
 * Canonical onboarding and CLI usage text. No dependencies — safe to import
 * before config. Reuse in CLI, web UI, MCP tools, docs, etc.
 */

/** One-line hint shown when a command fails due to missing env (e.g. before full SETUP_INSTRUCTIONS). */
export const ONBOARDING_HINT_MISSING_ENV =
  "Run 'zmail setup' for full setup instructions (env vars, first sync).";

export const CLI_USAGE = `zmail — agent-first email

Usage:
  zmail                      Start web UI + MCP server and background sync
  zmail setup                Show setup instructions (env, first sync)
  zmail sync [--since <spec>]     Sync email + index embeddings (e.g. --since 7d, 5w, 3m, 2y)
  zmail search <query> [flags]    Search email (use --help for flags)
  zmail who <query> [flags]       Find people by address or name (use --help for flags)
  zmail status                    Show sync and indexing status
  zmail stats                     Show database statistics
  zmail thread <id> [--raw]       Fetch thread (Markdown by default; raw .eml with --raw)
  zmail read <id> [--raw]         Read a message (or: zmail message <id>)
  zmail mcp                       Start MCP server (stdio)
`;

export const SETUP_INSTRUCTIONS = `zmail setup — get ready to sync and search

1. Environment
   Create a .env file (or set env vars). Required:
   - IMAP_USER          Your email (e.g. you@gmail.com)
   - IMAP_PASSWORD      App password (Gmail: Settings → Security → App Passwords)
   - OPENAI_API_KEY     For semantic search (e.g. sk-...)

   Optional: DATA_DIR (default ./data), PORT (default 3000).
   See .env.example in the repo for the full list.

2. First sync
   From the directory where you want data (or set DATA_DIR):
     zmail sync --since 7d
   Then use: zmail search <query>, zmail who <query>, zmail status, etc.

3. Web + MCP
   Run "zmail" with no arguments to start the web UI and MCP server (port 3000).
`;
