// DocumentExtractor interface — ADR-012
// Each format gets its own implementation behind this interface.

import { existsSync, readFileSync } from "fs";
import pdfParse from "@cedrugs/pdf-parse";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import TurndownService from "turndown";
import { getDb } from "~/db";

export interface ExtractedDocument {
  text: string;
  mimeType: string;
  filename: string;
}

export interface DocumentExtractor {
  canHandle(mimeType: string, filename: string): boolean;
  extract(buffer: Buffer, filename: string): Promise<ExtractedDocument>;
}

// PDF extractor
class PdfExtractor implements DocumentExtractor {
  canHandle(mimeType: string, _filename: string): boolean {
    return mimeType === "application/pdf";
  }

  async extract(buffer: Buffer, filename: string): Promise<ExtractedDocument> {
    const data = await pdfParse(buffer);
    return {
      text: data.text || "",
      mimeType: "application/pdf",
      filename,
    };
  }
}

// DOCX extractor (to markdown)
class DocxExtractor implements DocumentExtractor {
  canHandle(mimeType: string, filename: string): boolean {
    return (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      filename.toLowerCase().endsWith(".docx")
    );
  }

  async extract(buffer: Buffer, filename: string): Promise<ExtractedDocument> {
    const result = await (mammoth as any).convertToMarkdown({ buffer });
    return {
      text: result.value || "",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename,
    };
  }
}

// XLSX/XLS extractor (to CSV)
class XlsxExtractor implements DocumentExtractor {
  canHandle(mimeType: string, filename: string): boolean {
    return (
      mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel" ||
      filename.toLowerCase().endsWith(".xlsx") ||
      filename.toLowerCase().endsWith(".xls")
    );
  }

  async extract(buffer: Buffer, filename: string): Promise<ExtractedDocument> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheets: string[] = [];
    for (const worksheet of workbook.worksheets) {
      const rows: string[] = [];
      worksheet.eachRow((row) => {
        const values = row.values as (string | number | boolean | Date | null | undefined)[];
        // row.values is 1-indexed, skip index 0
        const cells = values.slice(1).map((v) => {
          if (v === null || v === undefined) return "";
          if (v instanceof Date) return v.toISOString().split("T")[0];
          const str = String(v);
          // Quote fields containing commas, quotes, or newlines
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        });
        rows.push(cells.join(","));
      });

      if (workbook.worksheets.length > 1) {
        sheets.push(`## Sheet: ${worksheet.name}\n\n${rows.join("\n")}`);
      } else {
        sheets.push(rows.join("\n"));
      }
    }

    return {
      text: sheets.join("\n\n"),
      mimeType: "text/csv",
      filename,
    };
  }
}

// CSV extractor (passthrough)
class CsvExtractor implements DocumentExtractor {
  canHandle(mimeType: string, filename: string): boolean {
    return mimeType === "text/csv" || filename.toLowerCase().endsWith(".csv");
  }

  async extract(buffer: Buffer, filename: string): Promise<ExtractedDocument> {
    return {
      text: buffer.toString("utf8"),
      mimeType: "text/csv",
      filename,
    };
  }
}

// HTML extractor (to markdown)
class HtmlExtractor implements DocumentExtractor {
  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService();
  }

  canHandle(mimeType: string, filename: string): boolean {
    return mimeType === "text/html" || filename.toLowerCase().endsWith(".html") || filename.toLowerCase().endsWith(".htm");
  }

  async extract(buffer: Buffer, filename: string): Promise<ExtractedDocument> {
    const html = buffer.toString("utf8");
    const markdown = this.turndown.turndown(html);
    return {
      text: markdown,
      mimeType: "text/markdown",
      filename,
    };
  }
}

// Plain text extractor (passthrough)
class TextExtractor implements DocumentExtractor {
  canHandle(mimeType: string, filename: string): boolean {
    return mimeType === "text/plain" || filename.toLowerCase().endsWith(".txt");
  }

  async extract(buffer: Buffer, filename: string): Promise<ExtractedDocument> {
    return {
      text: buffer.toString("utf8"),
      mimeType: "text/plain",
      filename,
    };
  }
}

// Registry of extractors (order matters - more specific first)
const extractors: DocumentExtractor[] = [
  new PdfExtractor(),
  new DocxExtractor(),
  new XlsxExtractor(),
  new CsvExtractor(),
  new HtmlExtractor(),
  new TextExtractor(),
];

/**
 * Determines the output format and file extension for a given mime type and filename.
 * Returns the extension (including the dot) for the converted file.
 */
function getOutputExtension(mimeType: string, filename: string): string {
  // Spreadsheets → CSV
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel" ||
    filename.toLowerCase().endsWith(".xlsx") ||
    filename.toLowerCase().endsWith(".xls")
  ) {
    return ".csv";
  }
  // CSV → CSV (passthrough)
  if (mimeType === "text/csv" || filename.toLowerCase().endsWith(".csv")) {
    return ".csv";
  }
  // Everything else → markdown
  return ".md";
}

/**
 * Extracts text from an attachment.
 * Returns the extracted text. Does NOT cache to sibling files yet (pending accuracy validation).
 */
export async function extractAndCache(
  rawPath: string, // absolute path to raw file
  mimeType: string,
  filename: string,
  attachmentId: number
): Promise<{ text: string; convertedPath: string }> {
  const outputExt = getOutputExtension(mimeType, filename);
  const convertedPath = rawPath + outputExt; // For reference only, not written yet

  // Check DB cache first
  const db = getDb();
  const existing = db.query("SELECT extracted_text FROM attachments WHERE id = ?").get(attachmentId) as
    | { extracted_text: string | null }
    | undefined;
  if (existing && existing.extracted_text) {
    return { text: existing.extracted_text, convertedPath };
  }

  // Find appropriate extractor
  const extractor = extractors.find((e) => e.canHandle(mimeType, filename));
  if (!extractor) {
    // Unsupported format - return stub message
    const sizeMB = (existsSync(rawPath) ? readFileSync(rawPath).length : 0) / (1024 * 1024);
    const stubText = `[Binary attachment: ${filename}, ${sizeMB.toFixed(2)} MB — no text extraction available]`;
    // Update DB with stub
    db.run("UPDATE attachments SET extracted_text = ? WHERE id = ?", [stubText, attachmentId]);
    return { text: stubText, convertedPath };
  }

  // Read raw file and extract
  const rawBuffer = readFileSync(rawPath);
  const extracted = await extractor.extract(rawBuffer, filename);

  // Update DB (but don't write sibling file yet - pending accuracy validation)
  db.run("UPDATE attachments SET extracted_text = ? WHERE id = ?", [extracted.text, attachmentId]);

  return { text: extracted.text, convertedPath };
}

/**
 * Legacy function for backwards compatibility.
 * Routes to the appropriate extractor based on mime type and filename.
 */
export async function extractAttachment(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<string | null> {
  const extractor = extractors.find((e) => e.canHandle(mimeType, filename));
  if (!extractor) {
    return null;
  }

  try {
    const result = await extractor.extract(buffer, filename);
    return result.text;
  } catch (err) {
    return null;
  }
}
