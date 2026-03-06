# OPP-007: Packaging and Distribution — npm, Homebrew, Ditching the Binary

**Status: Implemented.** Runtime is Node.js 22+; install via `npm i -g zmail`; dev uses `tsx`. See AGENTS.md and ARCHITECTURE.md ADR-008.

**Problem (historical):** The single-executable binary (Bun `--compile`) was attractive in concept but in practice Bun had bundling and runtime bugs. We see failures in the compiled binary: incompatible lib dependencies (e.g. [BUG-001](../../bugs/BUG-001-attachment-and-read-agent-friction.md) — pdf.js not resolvable inside the binary), and other native/bundling issues. We wanted a reliable install path that fits our target user (developers who use Claude) without depending on a fragile binary build.

**Context:** We chose Bun for native TypeScript and for the original "build a binary" capability. We ditched the binary and moved to Node so that distribution is simpler and more robust.

**Target user:** Developer who uses Claude (Claude Code, OpenClaw, Cursor). Same audience as OpenClaw and Claude Code CLI — both install via `npm i -g`.

---

## Options considered

### 1. npm i -g (run with Bun)

- Publish to npm with a `bin` that points to a script with shebang `#!/usr/bin/env bun`.
- User runs `npm i -g zmail` or `bun install -g zmail`; when they run `zmail`, the OS invokes Bun with that script.
- **Pros:** No compile step → avoids binary-only bugs; same codebase as dev; familiar install for the audience.
- **Cons:** User must have **Bun** installed and on PATH. Node version only matters for the npm client (e.g. Node 18+); runtime is Bun.

### 2. npm i -g (run with Node) — chosen

- Port the app to run on **Node**: replace Bun-only APIs, distribute via npm with `#!/usr/bin/env node` (or run compiled JS).
- User runs `npm i -g zmail`; only Node is required (no Bun).
- **Pros:** Single runtime that virtually every dev has; aligns with OpenClaw (`npm i -g openclaw`, Node 22+), Claude Code (`npm i -g claude`, Node 18+); no binary build at all.
- **Cons:** One-time port (done). Slightly slower cold start than a native binary (usually negligible for CLI tool-use).

### 3. Homebrew

- **Binary formula:** Ship the compiled binary (e.g. from GitHub Releases). Same binary, same Bun compile bugs — does not solve the problem.
- **Source formula:** Formula depends on `node`, installs npm package, runs with Node — same as option 2, different channel.
- Homebrew is a **distribution channel**, not a substitute for choosing runtime (Bun vs Node) or binary vs script.

### 4. Other

- **curl | sh installer:** Can detect/install Node, then `npm i -g zmail`. Complements npm; same runtime choice as above.
- **Keep single binary:** Either fix Bun's compile/bundling (e.g. pdf.js, native deps) or switch toolchain (e.g. Node + pkg/nexe). Higher effort and/or different tradeoffs; not pursued here.

---

## Recommendation (implemented)

- **Ditch the binary** as the primary distribution artifact.
- **Distribute via npm** so that `npm i -g zmail` is the canonical install. This matches OpenClaw and Claude Code and fits the target user.
- **Use Node for the installed CLI** so that users do not need Bun at all: document "Node 22+" (see AGENTS.md). Bun was chosen for native TS and binary; we dropped the binary and ported to Node.

---

## Node port (done)

Replacements made:

| Former (Bun)        | Current (Node)     |
|---------------------|--------------------|
| `bun:sqlite`        | `better-sqlite3`   |
| `Bun.serve` (web UI)| Web UI removed; CLI + MCP only |
| `Bun.spawn`         | `child_process.spawn` |
| `bun:test`          | **vitest**         |

- **TypeScript:** We ship compiled JS (`tsc` + `tsc-alias`); `bin` points to `dist/index.js` with `#!/usr/bin/env node`.
- **No migrations:** Unchanged; schema and "rebuild from scratch" guidance stay as in AGENTS.md and ARCHITECTURE.md.

---

## Version expectations (current docs)

- **Requires Node 22+.** Install with `npm i -g zmail`. No Bun required.

---

## Relation to other opportunities

- **OPP-005** (Onboarding — Claude Code and OpenClaw): The canonical install is `npm i -g zmail`. The onboarding skill and install-cli wrapper use that; the wrapper script (`npm run install-cli`) runs source via `npx tsx` for development from any directory.
