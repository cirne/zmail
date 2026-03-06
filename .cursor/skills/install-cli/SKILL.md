---
name: install-cli
description: Build and install the zmail CLI binary to a directory on PATH for testing from other workspaces. Use when you need to test the compiled binary from another directory or project.
---

# CLI installation (dev time)

## Principle

Builds the native binary and installs it to a directory on your PATH so you can use `zmail` from any directory, including other workspaces or Claude Code projects.

## What it does

1. **Builds** the native binary using `bun build --compile` → `dist/zmail`
2. **Installs** the binary to `~/.local/bin/zmail` (or `ZMAIL_INSTALL_DIR` if set)
3. **Makes executable** (`chmod +x`)
4. **Provides instructions** for ensuring the install directory is on PATH

## Usage

```bash
bun run install-cli
```

Or via npm script:
```bash
bun run install-cli
```

## Install location

- **Default:** `~/.local/bin/zmail`
- **Override:** Set `ZMAIL_INSTALL_DIR` environment variable to install elsewhere
  ```bash
  ZMAIL_INSTALL_DIR=/usr/local/bin bun run install-cli
  ```

## PATH setup

After installation, ensure the install directory is on your PATH:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Add this to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.) to make it permanent.

## When to use

- **Testing from another workspace** — Install the binary so you can run `zmail` commands from a different directory
- **After code changes** — Rebuild and reinstall after modifying CLI code to test the compiled binary
- **Cross-project testing** — Use zmail CLI from other Claude Code projects or workspaces
- **Binary verification** — Test that the compiled binary works correctly outside the dev environment

## How it works

The script (`scripts/install-cli.ts`):
1. Compiles `src/index.ts` to a native binary at `dist/zmail`
2. Creates the install directory if it doesn't exist
3. Copies the binary to the install location
4. Sets executable permissions (755)
5. Prints installation path and PATH setup instructions

## Notes

- The installed binary is **standalone** — it doesn't depend on the source code or node_modules
- The binary uses the **current working directory** for data (or `DATA_DIR` env var)
- Config is read from `~/.zmail/config.json` and `~/.zmail/.env` (or `ZMAIL_HOME` if set)
- Re-running `install-cli` overwrites the previous installation
