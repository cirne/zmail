import { describe, it, expect } from "bun:test";
import { parseRawMessage } from "./parse-message";

describe("parseRawMessage", () => {
  it("extracts plain text body when available", async () => {
    const raw = Buffer.from(
      `From: test@example.com
To: recipient@example.com
Subject: Test
Content-Type: text/plain

Hello world`
    );

    const parsed = await parseRawMessage(raw);
    expect(parsed.bodyText.trim()).toBe("Hello world");
    expect(parsed.bodyHtml).toBeNull();
  });

  it("extracts HTML body and converts to markdown when no plain text", async () => {
    const raw = Buffer.from(
      `From: test@example.com
To: recipient@example.com
Subject: Test
Content-Type: text/html

<h1>Hello</h1>
<p>World</p>`
    );

    const parsed = await parseRawMessage(raw);
    expect(parsed.bodyText).toContain("Hello");
    expect(parsed.bodyText).toContain("World");
    expect(parsed.bodyHtml).toContain("<h1>Hello</h1>");
    // Should be converted to markdown (not raw HTML)
    expect(parsed.bodyText).not.toContain("<h1>");
  });

  it("prefers plain text over HTML when both are available", async () => {
    const raw = Buffer.from(
      `From: test@example.com
To: recipient@example.com
Subject: Test
Content-Type: multipart/alternative; boundary="boundary"

--boundary
Content-Type: text/plain

Plain text version

--boundary
Content-Type: text/html

<h1>HTML version</h1>
--boundary--`
    );

    const parsed = await parseRawMessage(raw);
    // Should prefer plain text
    expect(parsed.bodyText).toContain("Plain text version");
    expect(parsed.bodyText).not.toContain("HTML version");
    expect(parsed.bodyHtml).toContain("HTML version");
  });

  it("extracts message metadata correctly", async () => {
    const raw = Buffer.from(
      `Message-ID: <test@example.com>
From: Alice <alice@example.com>
To: Bob <bob@example.com>
Cc: Charlie <charlie@example.com>
Subject: Test Subject
Date: Mon, 1 Jan 2024 12:00:00 +0000
Content-Type: text/plain

Body content`
    );

    const parsed = await parseRawMessage(raw);
    expect(parsed.messageId).toBe("<test@example.com>");
    expect(parsed.fromAddress).toBe("alice@example.com");
    expect(parsed.fromName).toBe("Alice");
    expect(parsed.toAddresses).toContain("bob@example.com");
    expect(parsed.ccAddresses).toContain("charlie@example.com");
    expect(parsed.subject).toBe("Test Subject");
    expect(parsed.bodyText.trim()).toBe("Body content");
  });

  it("handles HTML-only emails by converting to markdown", async () => {
    const raw = Buffer.from(
      `From: test@example.com
To: recipient@example.com
Subject: Receipt
Content-Type: text/html

<html>
<body>
<h1>Receipt</h1>
<p>Total: <strong>$10.00</strong></p>
<ul>
<li>Item 1</li>
<li>Item 2</li>
</ul>
</body>
</html>`
    );

    const parsed = await parseRawMessage(raw);
    // Should extract text from HTML (converted to markdown)
    expect(parsed.bodyText).toContain("Receipt");
    expect(parsed.bodyText).toContain("Total");
    expect(parsed.bodyText).toContain("$10.00");
    expect(parsed.bodyText).toContain("Item 1");
    expect(parsed.bodyText).toContain("Item 2");
    // Should not contain raw HTML tags
    expect(parsed.bodyText).not.toContain("<h1>");
    expect(parsed.bodyText).not.toContain("<p>");
    expect(parsed.bodyHtml).toContain("<h1>Receipt</h1>");
  });
});
