import { simpleParser } from "mailparser";

export interface ParsedMessage {
  messageId: string;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  date: string; // ISO
  bodyText: string;
  bodyHtml: string | null;
}

function collectAddresses(value: unknown): string[] {
  const addrs: string[] = [];
  const arr = Array.isArray(value) ? value : value ? [value] : [];
  for (const item of arr) {
    const addr = item && typeof item === "object" && "address" in item ? (item as { address: string }).address : null;
    if (addr) addrs.push(addr);
  }
  return addrs;
}

export async function parseRawMessage(raw: Buffer): Promise<ParsedMessage> {
  const parsed = await simpleParser(raw);
  const from = parsed.from?.value?.[0];
  const fromAddress = from?.address ?? "";
  const fromName = from?.name ?? null;
  const toAddresses = collectAddresses(parsed.to);
  const ccAddresses = collectAddresses(parsed.cc);
  const subject = parsed.subject ?? "";
  const date = parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString();
  const bodyText = parsed.text ?? "";
  const bodyHtml = parsed.html ? (typeof parsed.html === "string" ? parsed.html : null) : null;
  const messageId = parsed.messageId ?? `<unknown-${Date.now()}@local>`;

  return {
    messageId,
    fromAddress,
    fromName,
    toAddresses,
    ccAddresses,
    subject,
    date,
    bodyText,
    bodyHtml,
  };
}
