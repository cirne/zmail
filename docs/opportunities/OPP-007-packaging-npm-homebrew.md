# OPP-007: Packaging and Distribution — npm, Homebrew, Ditching the Binary

**Status: Implemented.** Runtime is Node.js 22+; install via `npm i -g @cirne/zmail` (or TBD scoped name); dev uses `tsx`. See AGENTS.md and ARCHITECTURE.md ADR-008.

**Package name:** The unscoped name `zmail` is already taken on npm (old package, ~3 weekly downloads). Actual package name TBD; short term likely **`@cirne/zmail`** (scoped), so install would be `npm i -g @cirne/zmail`.

**Problem (historical):** The single-executable binary (Bun `--compile`) was attractive in concept but in practice Bun had bundling and runtime bugs. We see failures in the compiled binary: incompatible lib dependencies (e.g. [BUG-001](bugs/BUG-001-attachment-and-read-agent-friction.md) — pdf.js not resolvable inside the binary), and other native/bundling issues. We want a reliable install path that fits our target user (developers who use Claude) without depending on a fragile binary build.

**Context:** We chose Bun for native TypeScript and for the original "build a binary" capability. We are open to ditching the binary and, if useful, moving off Bun so that distribution is simpler and more robust.

**Target user:** Developer who uses Claude (Claude Code, OpenClaw, Cursor). Same audience as OpenClaw and Claude Code CLI — both install via `npm i -g`.

---

## Options considered

### 1. npm i -g (run with Bun)

- Publish to npm with a `bin` that points to a script with shebang `#!/usr/bin/env bun`.
- User runs `npm i -g @cirne/zmail` or `bun install -g @cirne/zmail`; when they run `zmail`, the OS invokes Bun with that script.
- **Pros:** No compile step → avoids binary-only bugs; same codebase as dev; familiar install for the audience.
- **Cons:** User must have **Bun** installed and on PATH. Node version only matters for the npm client (e.g. Node 18+); runtime is Bun.

### 2. npm i -g (run with Node) — recommended

- Port the app to run on **Node**: replace Bun-only APIs, distribute via npm with `#!/usr/bin/env node` (or run compiled JS).
- User runs `npm i -g @cirne/zmail`; only Node is required (no Bun).
- **Pros:** Single runtime that virtually every dev has; aligns with OpenClaw (`npm i -g openclaw`, Node 22+), Claude Code (`npm i -g claude`, Node 18+); no binary build at all.
- **Cons:** One-time port (see below). Slightly slower cold start than a native binary (usually negligible for CLI tool-use).

### 3. Homebrew

- **Binary formula:** Ship the compiled binary (e.g. from GitHub Releases). Same binary, same Bun compile bugs — does not solve the problem.
- **Source formula:** Formula depends on `bun`, installs package or tarball, runs with `bun run` or a Bun shebang. Avoids binary bugs but still requires Bun. Alternatively, formula depends on `node`, installs npm package, runs with Node — same as option 2, different channel.
- Homebrew is a **distribution channel**, not a substitute for choosing runtime (Bun vs Node) or binary vs script.

### 4. Other

- **curl \| sh installer:** Can detect/install Bun or Node, then `bun install -g @cirne/zmail` or `npm i -g @cirne/zmail`. Complements npm; same runtime choice as above.
- **Keep single binary:** Either fix Bun’s compile/bundling (e.g. pdf.js, native deps) or switch toolchain (e.g. Node + pkg/nexe). Higher effort and/or different tradeoffs; not pursued here.

---

## Recommendation

- **Ditch the binary** as the primary distribution artifact.
- **Distribute via npm** so that `npm i -g @cirne/zmail` (or TBD scoped name; unscoped `zmail` is taken on npm) is the canonical install. This matches OpenClaw and Claude Code and fits the target user.
- **Prefer Node over Bun for the installed CLI** so that users do not need Bun at all: document “Node 18+” (or 20+), same as typical npm CLIs. Bun was chosen for native TS and binary; if we drop the binary, the benefit of requiring Bun at runtime is small.

---

## Node port (if we move off Bun)

Replacements are localized and well-understood:

| Current (Bun)        | Replacement (Node)                          |
|----------------------|---------------------------------------------|
| `bun:sqlite`         | `better-sqlite3` (or `sql.js` if no native) |
| `Bun.serve` (web UI) | Node `http` / `createServer` or small lib   |
| `Bun.spawn`          | `child_process.spawn`                      |

- **TypeScript:** Keep writing TS. For the published package, either:
  - Ship compiled JS (`tsc`); `bin` points to `dist/index.js` with `#!/usr/bin/env node`, or
  - Ship TS and use **tsx** as the bin (e.g. `bin: { "zmail": "dist/run.js" }` where `run.js` is a small wrapper that uses `tsx` or `node --loader ts-node/esm` to run the TS entry). Many CLIs ship JS for simplicity and smaller install.
- **Tests:** Today they use `bun:test`; would move to **vitest** or **node:test** (and keep TS).
- **No migrations:** Unchanged; schema and “rebuild from scratch” guidance stay as in [AGENTS.md](../../AGENTS.md) and [ARCHITECTURE.md](../ARCHITECTURE.md).

---

## Version expectations (for docs)

- **If we stay on Bun (npm package, run with Bun):** “Requires Bun 1.x. Install with `npm i -g @cirne/zmail` (Node 18+ for npm) or `bun install -g @cirne/zmail`.”
- **If we port to Node:** “Requires Node 18+ (LTS). Install with `npm i -g @cirne/zmail` (or TBD package name).” No Bun required.

---

## Relation to other opportunities

- **[OPP-005](OPP-005-onboarding-claude-code.md)** (Onboarding — Claude Code and OpenClaw): A stable install method is a prerequisite. If the canonical install becomes `npm i -g @cirne/zmail` (or TBD), the onboarding skill and any install script should use that; “download binary from URL” becomes optional or secondary (e.g. for users who prefer a standalone binary once we have a reliable build).
