# OPP-006: Attachment Search and Sibling-File Caching

## Status: Opportunity (attachment extraction is shipped; these are next steps)

## Context

Attachment extraction is working (ADR-012). Agents can list and read attachments via CLI (`zmail attachment list/read`) and MCP (`list_attachments`/`read_attachment`). Supported formats: PDF, DOCX, XLSX, HTML, CSV, TXT.

What's missing: agents can't **search inside** attachment content, and extracted text is only cached in the DB (not as sibling files on disk for faster access).

## Opportunity 1: FTS5 indexing of attachment content

**Problem:** `zmail search "indemnification clause"` won't find a match inside a PDF attachment — it only searches message subjects and body text.

**Direction:** After extraction, insert attachment text into a new `attachments_fts` FTS5 virtual table (or extend `messages_fts` to include attachment content). Search results should indicate when a match comes from an attachment vs. the message body.

## Opportunity 2: Sibling-file caching

**Problem:** Extracted text is cached in the DB `extracted_text` column. For large attachments this bloats the DB and is slower than reading a file from disk.

**Direction:** Write extracted text as a sibling file next to the raw attachment (`Agreement.pdf.md` or `Budget.xlsx.csv`). Check for sibling file existence before hitting the DB. This is deferred until extraction accuracy is validated across more real-world files.

## Opportunity 3: Additional format support

**Not yet supported:**
- PPTX — `officeparser` for text extraction
- Images — Vision API (GPT-4o / Claude) for OCR and description
- MSG (Outlook) — `@nicktomlin/msg-reader` or similar

## Opportunity 4: Attachment-aware `zmail read` output

**Currently:** `zmail read <message_id>` includes attachment metadata (id, filename, mimeType, size, extracted flag) in the JSON output.

**Direction:** Optionally inline extracted attachment text in the `read` output so the agent gets the full picture in one call (message body + attachment content), controlled by a `--with-attachments` flag.
