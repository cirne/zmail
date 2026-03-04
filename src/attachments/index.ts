// DocumentExtractor interface — ADR-012
// Each format gets its own implementation behind this interface.

export interface ExtractedDocument {
  text: string;
  mimeType: string;
  filename: string;
}

export interface DocumentExtractor {
  canHandle(mimeType: string, filename: string): boolean;
  extract(buffer: Buffer, filename: string): Promise<ExtractedDocument>;
}

// TODO: PdfExtractor   — pdfjs-dist
// TODO: DocxExtractor  — mammoth
// TODO: XlsxExtractor  — xlsx (SheetJS)
// TODO: PptxExtractor  — officeparser
// TODO: HtmlExtractor  — turndown
// TODO: ImageExtractor — GPT-4o / Claude vision API

export async function extractAttachment(
  _buffer: Buffer,
  _mimeType: string,
  _filename: string
): Promise<string | null> {
  // TODO: route to the right extractor, return markdown text
  return null;
}
