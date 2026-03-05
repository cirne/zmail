// Core domain types shared across modules

export interface Message {
  id: number;
  messageId: string; // RFC 2822 Message-ID header
  threadId: string;
  folder: string;
  uid: number;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string; // JSON array
  ccAddresses: string; // JSON array
  subject: string;
  date: string; // ISO 8601
  bodyText: string;
  rawPath: string; // path to .eml file in maildir
  syncedAt: string;
}

export interface Thread {
  threadId: string;
  subject: string;
  participantCount: number;
  messageCount: number;
  lastMessageAt: string;
}

export interface Attachment {
  id: number;
  messageId: string;
  filename: string;
  mimeType: string;
  size: number;
  storedPath: string;
  extractedText: string | null;
}

export interface Contact {
  address: string;
  displayName: string | null;
  messageCount: number;
}

export interface SyncState {
  folder: string;
  uidvalidity: number;
  lastUid: number;
}

export interface SyncWindow {
  id: number;
  phase: number;
  windowStart: string;
  windowEnd: string;
  status: "pending" | "running" | "completed" | "failed";
  messagesFound: number;
  messagesSynced: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface SyncSummary {
  earliestSyncedDate: string | null;
  latestSyncedDate: string | null;
  totalMessages: number;
  lastSyncAt: string | null;
  isRunning: boolean;
}

export interface SearchResult {
  messageId: string;
  threadId: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  date: string;
  snippet: string;
  rank: number;
}

/** One identity from `zmail who`: address + best-known display name and counts. */
export interface WhoPerson {
  address: string;
  displayName: string | null;
  sentCount: number;
  receivedCount: number;
  mentionedCount: number;
}

/** Result of who(db, { query, ... }). */
export interface WhoResult {
  query: string;
  people: WhoPerson[];
}
