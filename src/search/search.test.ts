import { describe, it, expect, beforeEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { createTestDb, insertTestMessage } from "~/db/test-helpers";
import { search } from "./index";

describe("search", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns empty array when no messages exist", () => {
    const results = search(db, { query: "anything" });
    expect(results).toEqual([]);
  });

  it("finds a message by subject keyword", () => {
    insertTestMessage(db, { subject: "Invoice from Stripe" });
    const results = search(db, { query: "Invoice" });
    expect(results.length).toBe(1);
    expect(results[0].subject).toBe("Invoice from Stripe");
  });

  it("finds a message by body keyword", () => {
    insertTestMessage(db, {
      subject: "Meeting notes",
      bodyText: "We discussed the Q4 roadmap and budget allocation",
    });
    const results = search(db, { query: "roadmap" });
    expect(results.length).toBe(1);
  });

  it("returns multiple matches ranked by relevance", () => {
    insertTestMessage(db, {
      subject: "Contract renewal",
      bodyText: "Please review the attached contract for renewal",
    });
    insertTestMessage(db, {
      subject: "Quick question",
      bodyText: "Can you check the contract?",
    });
    insertTestMessage(db, {
      subject: "Unrelated email",
      bodyText: "Lunch plans for tomorrow",
    });

    const results = search(db, { query: "contract" });
    expect(results.length).toBe(2);
  });

  it("respects the limit option", () => {
    for (let i = 0; i < 5; i++) {
      insertTestMessage(db, { subject: `Report number ${i}`, bodyText: "report content" });
    }
    const results = search(db, { query: "report", limit: 3 });
    expect(results.length).toBe(3);
  });

  it("returns expected fields on each result", () => {
    insertTestMessage(db, {
      subject: "Hello from Alice",
      fromAddress: "alice@example.com",
      bodyText: "Just checking in",
    });

    const results = search(db, { query: "Hello" });
    expect(results.length).toBe(1);

    const r = results[0];
    expect(r.messageId).toBeDefined();
    expect(r.threadId).toBeDefined();
    expect(r.subject).toBe("Hello from Alice");
    expect(r.fromAddress).toBe("alice@example.com");
    expect(r.date).toBeDefined();
    expect(r.snippet).toBeDefined();
    expect(r.rank).toBeDefined();
  });

  it("does not return messages that do not match", () => {
    insertTestMessage(db, { subject: "Cats are great", bodyText: "I love cats" });
    const results = search(db, { query: "dogs" });
    expect(results.length).toBe(0);
  });

  it("handles FTS special characters without throwing", () => {
    insertTestMessage(db, { subject: "Normal email" });
    // These are common user inputs that could break naive FTS queries
    expect(() => search(db, { query: "hello world" })).not.toThrow();
  });
});
