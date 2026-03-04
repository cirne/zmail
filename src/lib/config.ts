import { join } from "path";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split("T")[0];

export const config = {
  imap: {
    host: optional("IMAP_HOST", "imap.gmail.com"),
    port: Number(optional("IMAP_PORT", "993")),
    user: optional("IMAP_USER", ""),
    password: optional("IMAP_PASSWORD", ""),
  },
  sync: {
    fromDate: optional("SYNC_FROM_DATE", oneYearAgo),
  },
  google: {
    clientId: optional("GOOGLE_CLIENT_ID", ""),
    clientSecret: optional("GOOGLE_CLIENT_SECRET", ""),
  },
  auth: {
    secret: optional("AUTH_SECRET", "dev-secret-change-me"),
  },
  openai: {
    apiKey: optional("OPENAI_API_KEY", ""),
  },
  dataDir: optional("DATA_DIR", "./data"),
  port: Number(optional("PORT", "3000")),

  // Derived paths
  get dbPath() {
    return join(this.dataDir, "agentmail.db");
  },
  get maildirPath() {
    return join(this.dataDir, "maildir");
  },
  get vectorsPath() {
    return join(this.dataDir, "vectors");
  },
} as const;

export function requireImapConfig() {
  required("IMAP_USER");
  required("IMAP_PASSWORD");
  return config.imap;
}
