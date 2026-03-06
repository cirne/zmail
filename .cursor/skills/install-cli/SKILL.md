---
name: install-cli
description: Install a zmail wrapper script to a directory on PATH so you can run `zmail` from any directory (e.g. other workspaces). The wrapper runs the source via `npx tsx` — no compiled binary.
---

# CLI installation (dev time)

## Principle

Installs a small wrapper script at `~/.local/bin/zmail` (or `ZMAIL_INSTALL_DIR`) that runs `npx tsx <repo>/src/index.ts -- "$@"`. You can then run `zmail` from any directory; config is still read from `~/.zmail/`.

## What it does

1. **Writes** a bash script to `~/.local/bin/zmail` (or `ZMAIL_INSTALL_DIR`)
2. The script **exec**s `npx tsx "$ZMAIL_REPO/src/index.ts" -- "$@"` (repo path is embedded at install time)
3. **Creates** the install directory if needed and sets the script executable (755)
4. **Prints** instructions for PATH and reinstall-after-move

## Usage

```bash
npm run install-cli
```

Or directly:
```bash
npx tsx scripts/install-cli.ts
```

## Install location

- **Default:** `~/.local/bin/zmail`
- **Override:** Set `ZMAIL_INSTALL_DIR` environment variable to install elsewhere
  ```bash
  ZMAIL_INSTALL_DIR=/usr/local/bin npm run install-cli
  ```

## PATH setup

After installation, ensure the install directory is on your PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Add this to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.) to make it permanent.

## When to use

- **Testing from another workspace** — Install the wrapper so you can run `zmail` from a different directory
- **After moving the repo** — Run `npm run install-cli` again from the new path to update the embedded repo path
- **Cross-project testing** — Use zmail CLI from other Claude Code projects or workspaces

## How it works

The script (`scripts/install-cli.ts`):
1. Resolves the project root (from `import.meta.dirname`)
2. Writes a bash script that sets `ZMAIL_REPO` to that path and runs `npx tsx "$ZMAIL_REPO/src/index.ts" -- "$@"`
3. Creates the install directory if it doesn't exist and makes the script executable (755)

## Notes

- The installed **wrapper** runs the **source** via tsx — it requires Node.js and the repo (or a copy) at the path used when you ran install-cli
- Config and data dir are under **ZMAIL_HOME** (default `~/.zmail`): `config.json`, `.env`, and `data/` (DB, maildir, vectors). Override with the `ZMAIL_HOME` env var only; there is no `DATA_DIR`.
- For a **standalone** install (no repo), use `npm run build` then `npm i -g .` so the `zmail` bin runs `dist/index.js` with Node
