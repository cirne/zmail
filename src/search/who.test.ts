import { describe, it, expect, beforeEach } from "vitest";
import type { SqliteDatabase } from "~/db";
import { createTestDb, insertTestMessage } from "~/db/test-helpers";
import { who } from "./who";

/** Insert a message with full control over from/to/cc for who() tests. */
function insertMessage(
  db: SqliteDatabase,
  opts: {
    messageId: string;
    fromAddress: string;
    fromName?: string | null;
    toAddresses?: string[];
    ccAddresses?: string[];
    subject?: string;
    date?: string;
  }
) {
  const messageId = opts.messageId;
  const threadId = "thread-1";
  const to = JSON.stringify(opts.toAddresses ?? []);
  const cc = JSON.stringify(opts.ccAddresses ?? []);
  const subject = opts.subject ?? "Test";
  const date = opts.date ?? new Date().toISOString();

  db.prepare(
    `INSERT INTO messages
       (message_id, thread_id, folder, uid, from_address, from_name, to_addresses, cc_addresses, subject, body_text, date, raw_path)
     VALUES (?, ?, '[Gmail]/All Mail', 1, ?, ?, ?, ?, ?, '', ?, 'maildir/test.eml')`
  ).run(messageId, threadId, opts.fromAddress, opts.fromName ?? null, to, cc, subject, date);
}

describe("who", () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns empty people when no messages match", () => {
    insertTestMessage(db, { fromAddress: "alice@example.com", subject: "Hi" });
    const result = who(db, { query: "nonexistent" });
    expect(result.query).toBe("nonexistent");
    expect(result.people).toEqual([]);
  });

  it("matches identity by from_address", () => {
    insertMessage(db, {
      messageId: "<1@a>",
      fromAddress: "tom@example.com",
      fromName: "Tom Smith",
    });
    insertMessage(db, {
      messageId: "<2@a>",
      fromAddress: "tom@example.com",
      fromName: "Tom Smith",
    });

    const result = who(db, { query: "tom" });
    expect(result.people.length).toBe(1);
    expect(result.people[0].address).toBe("tom@example.com");
    expect(result.people[0].displayName).toBe("Tom Smith");
    expect(result.people[0].sentCount).toBe(2);
    expect(result.people[0].receivedCount).toBe(0);
    expect(result.people[0].mentionedCount).toBe(0);
  });

  it("matches identity by from_name", () => {
    insertMessage(db, {
      messageId: "<1@b>",
      fromAddress: "geoff@company.com",
      fromName: "Geoff Cirne",
    });

    const result = who(db, { query: "geoff" });
    expect(result.people.length).toBe(1);
    expect(result.people[0].address).toBe("geoff@company.com");
    expect(result.people[0].displayName).toBe("Geoff Cirne");
    expect(result.people[0].sentCount).toBe(1);
  });

  it("matches identity appearing only in to_addresses", () => {
    insertMessage(db, {
      messageId: "<1@c>",
      fromAddress: "sender@example.com",
      toAddresses: ["recipient@example.com", "other@example.com"],
      ccAddresses: [],
    });

    const result = who(db, { query: "recipient" });
    expect(result.people.length).toBe(1);
    expect(result.people[0].address).toBe("recipient@example.com");
    expect(result.people[0].displayName).toBeNull();
    expect(result.people[0].sentCount).toBe(0);
    expect(result.people[0].receivedCount).toBe(1);
    expect(result.people[0].mentionedCount).toBe(0);
  });

  it("matches identity appearing only in cc_addresses", () => {
    insertMessage(db, {
      messageId: "<1@d>",
      fromAddress: "sender@example.com",
      toAddresses: [],
      ccAddresses: ["ccperson@example.com"],
    });
    insertMessage(db, {
      messageId: "<2@d>",
      fromAddress: "other@example.com",
      toAddresses: [],
      ccAddresses: ["ccperson@example.com"],
    });

    const result = who(db, { query: "ccperson" });
    expect(result.people.length).toBe(1);
    expect(result.people[0].address).toBe("ccperson@example.com");
    expect(result.people[0].sentCount).toBe(0);
    expect(result.people[0].receivedCount).toBe(2);
  });

  it("deduplicates by address and uses sender display name when available", () => {
    insertMessage(db, {
      messageId: "<1@e>",
      fromAddress: "alice@example.com",
      fromName: "Alice",
    });
    insertMessage(db, {
      messageId: "<2@e>",
      fromAddress: "bob@example.com",
      toAddresses: ["alice@example.com"],
    });

    const result = who(db, { query: "alice" });
    expect(result.people.length).toBe(1);
    expect(result.people[0].address).toBe("alice@example.com");
    expect(result.people[0].displayName).toBe("Alice");
    expect(result.people[0].sentCount).toBe(1);
    expect(result.people[0].receivedCount).toBe(1);
  });

  it("orders by sent_count DESC then received_count DESC", () => {
    insertMessage(db, {
      messageId: "<1@f>",
      fromAddress: "low@example.com",
      toAddresses: ["high@example.com"],
    });
    insertMessage(db, {
      messageId: "<2@f>",
      fromAddress: "high@example.com",
    });
    insertMessage(db, {
      messageId: "<3@f>",
      fromAddress: "high@example.com",
    });

    const result = who(db, { query: "example" });
    expect(result.people.length).toBe(2);
    expect(result.people[0].address).toBe("high@example.com");
    expect(result.people[0].sentCount).toBe(2);
    expect(result.people[0].receivedCount).toBe(1);
    expect(result.people[1].address).toBe("low@example.com");
    expect(result.people[1].sentCount).toBe(1);
    expect(result.people[1].receivedCount).toBe(0);
  });

  it("respects limit option", () => {
    insertMessage(db, {
      messageId: "<1@g>",
      fromAddress: "one@example.com",
    });
    insertMessage(db, {
      messageId: "<2@g>",
      fromAddress: "two@example.com",
    });
    insertMessage(db, {
      messageId: "<3@g>",
      fromAddress: "three@example.com",
    });

    const result = who(db, { query: "example", limit: 2 });
    expect(result.people.length).toBe(2);
  });

  it("respects minSent and minReceived options", () => {
    insertMessage(db, {
      messageId: "<1@h>",
      fromAddress: "sender@example.com",
    });
    insertMessage(db, {
      messageId: "<2@h>",
      fromAddress: "sender@example.com",
    });
    insertMessage(db, {
      messageId: "<3@h>",
      fromAddress: "other@example.com",
      toAddresses: ["recipient@example.com"],
    });

    const result = who(db, { query: "example", minSent: 2, minReceived: 0 });
    expect(result.people.length).toBe(1);
    expect(result.people[0].address).toBe("sender@example.com");
    expect(result.people[0].sentCount).toBe(2);
  });

  it("returns stable query in result", () => {
    insertMessage(db, {
      messageId: "<1@i>",
      fromAddress: "alice@example.com",
    });
    const result = who(db, { query: "  alice  " });
    expect(result.query).toBe("alice");
    expect(result.people.length).toBe(1);
  });

  it("matching is case-insensitive", () => {
    insertMessage(db, {
      messageId: "<1@j>",
      fromAddress: "Tom.Big@Example.COM",
      fromName: "Tom Big",
    });

    const result = who(db, { query: "tom" });
    expect(result.people.length).toBe(1);
    expect(result.people[0].address).toBe("Tom.Big@Example.COM");
  });

  describe("with ownerAddress (sent = I sent to them, received = from them to me, mentioned = in to/cc not sender)", () => {
    const me = "me@example.com";

    it("counts sent as emails owner sent to person, received as from person to owner, mentioned as person in to/cc but not sender", () => {
      // I send to Tim and Donna
      insertMessage(db, {
        messageId: "<1@owner>",
        fromAddress: me,
        toAddresses: ["tim@example.com", "donna@example.com"],
        ccAddresses: [],
      });
      // Donna sends to me and Tim
      insertMessage(db, {
        messageId: "<2@owner>",
        fromAddress: "donna@example.com",
        toAddresses: [me, "tim@example.com"],
        ccAddresses: [],
      });
      // Tim sends to me
      insertMessage(db, {
        messageId: "<3@owner>",
        fromAddress: "tim@example.com",
        toAddresses: [me],
        ccAddresses: [],
      });

      const result = who(db, { query: "example", ownerAddress: me });
      expect(result.people.length).toBe(3);

      const tim = result.people.find((p) => p.address === "tim@example.com")!;
      expect(tim.sentCount).toBe(1); // I sent to Tim (msg1)
      expect(tim.receivedCount).toBe(1); // Tim sent to me (msg3)
      expect(tim.mentionedCount).toBe(2); // Tim in to/cc in msg1 (I sent) and msg2 (Donna sent)

      const donna = result.people.find((p) => p.address === "donna@example.com")!;
      expect(donna.sentCount).toBe(1); // I sent to Donna (msg1)
      expect(donna.receivedCount).toBe(1); // Donna sent to me (msg2)
      expect(donna.mentionedCount).toBe(1); // Donna in to/cc only in msg1 (in msg2 she is sender)
    });
  });
});
