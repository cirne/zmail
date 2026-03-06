# Product Opportunities

Improvement ideas discovered through real usage. Each entry captures the problem, a concrete example, and a proposed direction.

See [VISION.md](./VISION.md) for product vision, [ARCHITECTURE.md](./ARCHITECTURE.md) for technical decisions.

---

| ID | Title | Summary |
|---|---|---|
| [OPP-001](opportunities/OPP-001-personalization.md) | Personalization — User Context for Search | Let users define aliases and context so queries like "ranch" match emails that use project names like "Son Story." |
| [OPP-002](opportunities/OPP-002-local-embeddings.md) | Local Embeddings — Eliminate Search Latency and OpenAI Dependency | Replace OpenAI API embeddings with a local `bge-small-en-v1.5` model via transformers.js. Cuts search latency from ~200ms to ~10ms, removes the `OPENAI_API_KEY` requirement. |
| [OPP-003](opportunities/OPP-003-cli-search-interface.md) | CLI Search Interface — Header-First Results + Selective Hydration | Optimize agent workflows with header-first defaults, mode controls (`auto|fts|semantic|hybrid`), payload-safe pagination, and explicit shortlist→hydrate retrieval. |
| [OPP-004](opportunities/OPP-004-people-index-contacts.md) | People Index and Writable Contacts — "Who" and Agent-Ready Identities | First-class people index from envelope data; `zmail who` and future `zmail contact` for agent-ready identity resolution and metadata. |
| [OPP-005](opportunities/OPP-005-onboarding-claude-code.md) | Onboarding Workflow — Claude Code and OpenClaw | Stable CLI release URL, agent-first skill (download → configure .env → verify), and llms.txt for amazing first-run experience in AI coding environments. CLI first; MCP later. |
| [OPP-006](opportunities/OPP-006-attachment-search-and-caching.md) | Attachment Search and Sibling-File Caching | FTS5 indexing of attachment content so search matches inside PDFs/docs; sibling-file caching for faster reads; additional format support (PPTX, images via vision). Extraction is shipped — these are next steps. |
| [OPP-007](opportunities/OPP-007-packaging-npm-homebrew.md) | Packaging and Distribution — npm, Homebrew | Ditch the Bun-compiled binary; distribute via `npm i -g`. Prefer Node runtime so only Node 18+ is required; optional Node port (better-sqlite3, Node http, child_process). Aligns with OpenClaw/Claude Code; unblocks OPP-005 onboarding. |
