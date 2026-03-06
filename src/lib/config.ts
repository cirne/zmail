import { join } from "path";
import { homedir } from "os";
import { existsSync, readFileSync } from "fs";

/** Canonical app root: ~/.zmail (cross-platform via os.homedir()). Can be overridden via ZMAIL_HOME env var. */
export const ZMAIL_HOME = process.env.ZMAIL_HOME || join(homedir(), ".zmail");

/** Load .env file from ZMAIL_HOME/.env and merge into process.env. */
function loadEnvFile() {
  const envPath = join(ZMAIL_HOME, ".env");
  if (!existsSync(envPath)) return;
  
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      // Don't overwrite existing env vars (allows shell/env override)
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

// Load .env before any config access
loadEnvFile();

interface ConfigJson {
  imap?: {
    host?: string;
    port?: number;
    user?: string;
  };
  sync?: {
    defaultSince?: string;
    mailbox?: string;
    excludeLabels?: string[];
  };
}

/** Load config.json from ZMAIL_HOME/config.json. Returns empty object if missing. */
function loadConfigJson(): ConfigJson {
  const configPath = join(ZMAIL_HOME, "config.json");
  if (!existsSync(configPath)) return {};
  
  try {
    const content = readFileSync(configPath, "utf8");
    return JSON.parse(content) as ConfigJson;
  } catch {
    return {};
  }
}

const configJson = loadConfigJson();

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

/** Get OpenAI API key with fallback: ZMAIL_OPENAI_API_KEY → OPENAI_API_KEY → error. */
function getOpenAIKey(): string {
  const zmailKey = process.env.ZMAIL_OPENAI_API_KEY;
  if (zmailKey) return zmailKey;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) return openaiKey;
  throw new Error("Missing required environment variable: ZMAIL_OPENAI_API_KEY or OPENAI_API_KEY");
}

export const config = {
  imap: {
    host: configJson.imap?.host || optional("IMAP_HOST", "imap.gmail.com"),
    port: configJson.imap?.port || Number(optional("IMAP_PORT", "993")),
    user: configJson.imap?.user || optional("IMAP_USER", ""),
    password: optional("ZMAIL_IMAP_PASSWORD", ""),
  },
  sync: {
    /** Default sync duration spec (e.g. 7d, 5w, 3m, 2y). Overridden by CLI --since. Default: 1y. */
    defaultSince: configJson.sync?.defaultSince || optional("DEFAULT_SYNC_SINCE", "1y"),
    /** Override mailbox to sync (e.g. "[Gmail]/All Mail" or "INBOX"). If unset, Gmail → All Mail, else INBOX. */
    mailbox: configJson.sync?.mailbox || optional("SYNC_MAILBOX", ""),
    /** Comma-separated labels to exclude (e.g. Trash,Spam). Case-insensitive. Default: Trash,Spam. */
    excludeLabels: configJson.sync?.excludeLabels || (optional("SYNC_EXCLUDE_LABELS", "Trash,Spam").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) as string[],
  },
  openai: {
    apiKey: getOpenAIKey(),
  },
  dataDir: join(ZMAIL_HOME, "data"),

  // Derived paths
  get dbPath() {
    return join(this.dataDir, "zmail.db");
  },
  get maildirPath() {
    return join(this.dataDir, "maildir");
  },
  get vectorsPath() {
    return join(this.dataDir, "vectors");
  },
  /** Path for embedding response cache. Empty if EMBEDDING_CACHE=0. */
  get embeddingCachePath(): string {
    if (process.env.EMBEDDING_CACHE === "0") return "";
    return join(this.dataDir, "embedding-cache");
  },
} as const;

export function requireImapConfig() {
  if (!config.imap.user) {
    throw new Error("Missing required config: imap.user (set in ~/.zmail/config.json or run 'zmail setup')");
  }
  if (!config.imap.password) {
    throw new Error("Missing required config: imap.password (set in ~/.zmail/.env as ZMAIL_IMAP_PASSWORD or run 'zmail setup')");
  }
  return config.imap;
}

/** Check if config.json exists. Used to determine if setup has been run. */
export function hasConfig(): boolean {
  const home = process.env.ZMAIL_HOME || join(homedir(), ".zmail");
  return existsSync(join(home, "config.json"));
}
