# OPP-005: Onboarding Workflow — Amazing First Run in Claude Code and OpenClau

**Problem:** New users in AI-assisted coding environments (Claude Code, OpenClau, Cursor, etc.) need to get the zmail CLI and configure their account with minimal friction. Today there is no single, agent-friendly path: no stable binary URL, no canonical “install + setup” flow, and no document optimized for LLM consumption. The result is brittle onboarding and repeated back-and-forth (“create an app password,” “where do I put it?”).

**Example:** A user in Claude Code says “set up zmail for my Gmail.” The agent should be able to (1) download the right binary from a stable URL, (2) guide creation of `.env` with Gmail + app password, (3) run first sync and confirm success — without cloning the repo or asking the user to hunt for docs.

**Vision:** Onboarding feels **amazing** in Claude Code and OpenClau: one skill or one doc gives the agent everything. First release is **CLI only**; MCP and web UI onboarding can follow later.

---

## Goals

- **Stable release location** — Published binaries at a predictable URL (e.g. GitHub Releases or a dedicated download domain) so “download zmail” is a single step.
- **Agent-first skill** — A Cursor/Codex-style skill (or equivalent) that any agent can follow: download → configure `.env` → verify. Single source of truth; no duplicate prose.
- **Minimal secrets** — User provides: Gmail address and a Gmail **app password** (not main password). Optional: `OPENAI_API_KEY` for semantic search. Everything else has sensible defaults.
- **Discoverability for LLMs** — Consider publishing an **llms.txt** so models (and thus Claude Code / OpenClau) have a dense, curated map of “what is zmail, how to install, how to configure.”

---

## Workflow (target state)

### 1. Download the CLI

- **Stable URL:** One base URL for “latest” or versioned release (e.g. `https://github.com/<org>/zmail/releases/latest` or `https://get.zmail.dev/...`).
- **Per-platform artifacts:** Named binaries or tarballs, e.g.:
  - `zmail-darwin-arm64` (Apple Silicon)
  - `zmail-darwin-x64` (Intel Mac)
  - `zmail-linux-x64` (Linux)
- **Agent instructions:** Download the artifact for the current OS/arch, make executable (`chmod +x zmail`), place on PATH (e.g. `~/bin`, `/usr/local/bin`) or document “run from this directory.”
- **Optional:** Install script (e.g. `curl -fsSL <url>/install.sh | sh`) that detects platform and installs to a standard path.

### 2. Account setup

- **Create `.env`** in the directory where the user will run zmail (project root, home dir, or a dedicated `~/.zmail` config dir — TBD).
- **Required variables:**
  - `IMAP_USER` — Gmail address.
  - `IMAP_PASSWORD` — Gmail **app password** (16-char, from [Google App Passwords](https://myaccount.google.com/apppasswords); 2-Step Verification must be on).
- **Optional:** `OPENAI_API_KEY` for semantic search.
- **Canonical reference:** Point to repo `.env.example` / AGENTS.md so the skill does not duplicate the full env list; the skill only mandates the minimal set above.
- **One-line guidance:** “Create an app password: https://myaccount.google.com/apppasswords (requires 2-Step Verification).”

### 3. Verify

- Run first sync: `zmail sync` (or equivalent from repo docs).
- Optionally: `zmail search "in:inbox"` or a simple query to confirm search works.
- If running from a specific directory, document that `zmail` must be run with that directory as cwd (or that `DATA_DIR` / `.env` path is resolved from cwd).

### 4. Do not

- Commit `.env` or real credentials.
- Commit `data/` or `.db` (align with AGENTS.md).

---

## Skill content (summary)

A **zmail-onboard** (or similar) skill would contain:

| Section | Content |
|--------|--------|
| **When to use** | User wants to install and configure zmail (CLI) for the first time in this environment. |
| **Download** | Stable URL; pick binary by OS/arch; `chmod +x`; add to PATH or run from dir. |
| **Account setup** | Create `.env` with `IMAP_USER`, `IMAP_PASSWORD`; link to app password page; optional `OPENAI_API_KEY`. Reference `.env.example` for full list. |
| **Verify** | `zmail sync` then optionally `zmail search "…"`. |
| **Do not** | Commit credentials or `data/`. |

The skill can live in this repo (e.g. `.cursor/skills/zmail-onboard/SKILL.md`) and/or in a shared skills repo so it’s available in Claude Code for users who don’t have the zmail repo.

---

## llms.txt — should we publish one?

**What it is:** [llms.txt](https://llmstxt.org/) is a convention for LLM discoverability: a markdown file at a well-known URL (e.g. `/llms.txt` on a project website, or in the repo root) that gives models a curated, dense map of the project — “what is this, how to install, how to configure” — without scraping entire docs.

**Why it helps:** Claude Code and OpenClau (and other AI coding tools) can fetch or be given the repo or a project URL. An llms.txt gives them one document to read for onboarding: name, one-line summary, install from stable URL, minimal env vars, app password link, first commands. Reduces hallucination and repeated “where’s the setup?” loops.

**Recommendation:** **Yes, publish an llms.txt.**

- **Where:** (1) Repo root so it’s in the codebase and any agent with repo access can read it; (2) if/when there is a project or docs website, also serve it at `https://<site>/llms.txt`.
- **Contents (minimal):**
  - **H1:** Project name (zmail).
  - **Blockquote:** One-sentence description (e.g. “Agent-first email: sync Gmail via IMAP, index locally, search from CLI.”).
  - **H2 sections:** e.g. “Install”, “Configure”, “First run”.
  - **Install:** Stable download URL; per-platform binaries; optional one-liner.
  - **Configure:** Create `.env` with `IMAP_USER`, `IMAP_PASSWORD` (Gmail app password); link to https://myaccount.google.com/apppasswords; optional `OPENAI_API_KEY`.
  - **First run:** `zmail sync`, then `zmail search "…"`.
  - **Lower priority:** Link to AGENTS.md, ARCHITECTURE.md, OPPORTUNITIES.md for deeper context.

This keeps the “amazing first run” story in one place for both humans and LLMs; the skill can say “see also llms.txt in repo for the canonical onboarding map.”

---

## Scope and order

- **First release:** CLI only. No MCP in the first onboarding flow; MCP can have its own doc/skill later (e.g. “run `zmail dev` or start MCP server after CLI works”).
- **Deliverables (candidate):**
  1. Stable release pipeline (e.g. GitHub Action) that publishes binaries per platform.
  2. Onboarding skill (download + setup + verify) in repo and/or shared skills repo.
  3. llms.txt in repo root (and on project site if applicable).
  4. Optional install script at stable URL.

---

## See also

- [AGENTS.md](../../AGENTS.md) — env vars, commands, single source of truth.
- [.env.example](../../.env.example) — canonical env list.
- [OPP-003](OPP-003-cli-search-interface.md) — CLI search interface (post-onboarding agent usage).
