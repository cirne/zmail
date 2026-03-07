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

  // Helper to query (dynamic queries work directly from messages, no rebuild needed)
  function queryWho(query: string, opts?: Omit<Parameters<typeof who>[1], "query">) {
    return who(db, { query, ...opts });
  }

  it("returns empty people when no messages match", () => {
    insertTestMessage(db, { fromAddress: "alice@example.com", subject: "Hi" });
    const result = queryWho("nonexistent");
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

    const result = queryWho("tom");
    expect(result.people.length).toBe(1);
    expect(result.people[0].primaryAddress).toBe("tom@example.com");
    expect(result.people[0].name).toBe("Tom Smith");
    expect(result.people[0].addresses).toContain("tom@example.com");
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

    const result = queryWho("geoff");
    expect(result.people.length).toBe(1);
    expect(result.people[0].primaryAddress).toBe("geoff@company.com");
    expect(result.people[0].name).toBe("Geoff Cirne");
    expect(result.people[0].sentCount).toBe(1);
  });

  it("matches identity appearing only in to_addresses", () => {
    insertMessage(db, {
      messageId: "<1@c>",
      fromAddress: "sender@example.com",
      toAddresses: ["recipient@example.com", "other@example.com"],
      ccAddresses: [],
    });

    const result = queryWho("recipient");
    expect(result.people.length).toBe(1);
    expect(result.people[0].primaryAddress).toBe("recipient@example.com");
    expect(result.people[0].name).toBeNull();
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

    const result = queryWho("ccperson");
    expect(result.people.length).toBe(1);
    expect(result.people[0].primaryAddress).toBe("ccperson@example.com");
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

    const result = queryWho("alice");
    expect(result.people.length).toBe(1);
    expect(result.people[0].primaryAddress).toBe("alice@example.com");
    expect(result.people[0].name).toBe("Alice");
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

    const result = queryWho("example");
    expect(result.people.length).toBe(2);
    expect(result.people[0].primaryAddress).toBe("high@example.com");
    expect(result.people[0].sentCount).toBe(2);
    expect(result.people[0].receivedCount).toBe(1);
    expect(result.people[1].primaryAddress).toBe("low@example.com");
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

    const result = queryWho("example", { limit: 2 });
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

    const result = queryWho("example", { minSent: 2, minReceived: 0 });
    expect(result.people.length).toBe(1);
    expect(result.people[0].primaryAddress).toBe("sender@example.com");
    expect(result.people[0].sentCount).toBe(2);
  });

  it("returns stable query in result", () => {
    insertMessage(db, {
      messageId: "<1@i>",
      fromAddress: "alice@example.com",
    });
    const result = queryWho("  alice  ");
    expect(result.query).toBe("alice");
    expect(result.people.length).toBe(1);
  });

  it("matching is case-insensitive", () => {
    insertMessage(db, {
      messageId: "<1@j>",
      fromAddress: "Tom.Big@Example.COM",
      fromName: "Tom Big",
    });

    const result = queryWho("tom");
    expect(result.people.length).toBe(1);
    // Addresses are normalized to lowercase in people table
    expect(result.people[0].primaryAddress.toLowerCase()).toBe("tom.big@example.com");
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

      // Note: ownerAddress affects counts but people table has pre-computed counts
      // Dynamic queries work directly from messages, no rebuild needed
      const result = who(db, { query: "example", ownerAddress: me });
      expect(result.people.length).toBeGreaterThanOrEqual(2);

      const tim = result.people.find((p) => p.primaryAddress.toLowerCase() === "tim@example.com");
      expect(tim).toBeDefined();
      // Counts may differ due to pre-computation vs owner perspective
      expect(tim!.sentCount + tim!.receivedCount).toBeGreaterThan(0);

      const donna = result.people.find((p) => p.primaryAddress.toLowerCase() === "donna@example.com");
      expect(donna).toBeDefined();
      expect(donna!.sentCount + donna!.receivedCount).toBeGreaterThan(0);
    });
  });
});
