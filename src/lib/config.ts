import { join } from "path";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  imap: {
    host: optional("IMAP_HOST", "imap.gmail.com"),
    port: Number(optional("IMAP_PORT", "993")),
    user: optional("IMAP_USER", ""),
    password: optional("IMAP_PASSWORD", ""),
  },
  sync: {
    /** Default sync duration spec (e.g. 7d, 5w, 3m, 2y). Overridden by CLI --since. Default: 1y. */
    defaultSince: optional("DEFAULT_SYNC_SINCE", "1y"),
    /** Override mailbox to sync (e.g. "[Gmail]/All Mail" or "INBOX"). If unset, Gmail → All Mail, else INBOX. */
    mailbox: optional("SYNC_MAILBOX", ""),
    /** Comma-separated labels to exclude (e.g. Trash,Spam). Case-insensitive. Default: Trash,Spam. */
    excludeLabels: (optional("SYNC_EXCLUDE_LABELS", "Trash,Spam").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) as string[],
  },
  google: {
    clientId: optional("GOOGLE_CLIENT_ID", ""),
    clientSecret: optional("GOOGLE_CLIENT_SECRET", ""),
  },
  auth: {
    secret: optional("AUTH_SECRET", "dev-secret-change-me"),
  },
  openai: {
    apiKey: required("OPENAI_API_KEY"),
  },
  dataDir: optional("DATA_DIR", "./data"),
  port: Number(optional("PORT", "3000")),

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
    return process.env.EMBEDDING_CACHE_PATH ?? join(this.dataDir, "embedding-cache");
  },
} as const;

export function requireImapConfig() {
  required("IMAP_USER");
  required("IMAP_PASSWORD");
  return config.imap;
}
