import PostalMime from "postal-mime";

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

export async function parseRawMessage(raw: Buffer): Promise<ParsedMessage> {
  // postal-mime is stream-free and works correctly in Bun (unlike mailparser's
  // Writable-based MailParser, whose _write callback is never invoked in Bun).
  const email = await PostalMime.parse(raw.buffer as ArrayBuffer);

  const messageId = email.messageId ?? `<unknown-${Date.now()}@local>`;
  const date = email.date ? new Date(email.date).toISOString() : new Date().toISOString();

  return {
    messageId,
    fromAddress: email.from?.address ?? "",
    fromName: email.from?.name || null,
    toAddresses: (email.to ?? []).map((a) => a.address).filter((a): a is string => Boolean(a)),
    ccAddresses: (email.cc ?? []).map((a) => a.address).filter((a): a is string => Boolean(a)),
    subject: email.subject ?? "",
    date,
    bodyText: email.text ?? "",
    bodyHtml: email.html ?? null,
  };
}
