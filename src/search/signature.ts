import { findPhoneNumbersInText } from "libphonenumber-js";

export interface ExtractedSignature {
  phone: string | null;
  title: string | null;
  company: string | null;
  urls: string[];
  altEmails: string[];
}

/**
 * Extract signature block from email body text.
 * Looks for common signature separators or falls back to detecting short lines near the end.
 */
export function extractSignature(bodyText: string): string | null {
  if (!bodyText || bodyText.length < 20) return null;

  const lines = bodyText.split("\n");
  if (lines.length < 3) return null;

  // Look for RFC 3676 signature separator: "-- " on its own line
  let sigStartIndex = -1;
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
    if (lines[i].trim() === "--") {
      sigStartIndex = i + 1;
      break;
    }
  }

  // Fallback: look for "___" or "---" separator
  if (sigStartIndex === -1) {
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
      const trimmed = lines[i].trim();
      if (trimmed === "___" || trimmed === "---" || trimmed.startsWith("___") || trimmed.startsWith("---")) {
        sigStartIndex = i + 1;
        break;
      }
    }
  }

  // Fallback: look for blank line gap followed by short lines
  if (sigStartIndex === -1) {
    let blankLineIndex = -1;
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 15); i--) {
      if (lines[i].trim() === "") {
        blankLineIndex = i;
        break;
      }
    }
    if (blankLineIndex >= 0 && blankLineIndex < lines.length - 2) {
      // Check if lines after blank are mostly short (signature-like)
      const candidateLines = lines.slice(blankLineIndex + 1);
      const shortLines = candidateLines.filter((l) => l.trim().length > 0 && l.trim().length < 80);
      if (shortLines.length >= 2) {
        sigStartIndex = blankLineIndex + 1;
      }
    }
  }

  if (sigStartIndex === -1 || sigStartIndex >= lines.length) return null;

  const signatureLines = lines.slice(sigStartIndex);
  let signatureText = signatureLines.join("\n").trim();

  // Strip common boilerplate
  signatureText = signatureText.replace(/Sent from my iPhone/gi, "");
  signatureText = signatureText.replace(/Get Outlook for (iOS|Android|Windows)/gi, "");
  signatureText = signatureText.replace(/Sent from my (iPad|Android device)/gi, "");

  return signatureText.length > 0 ? signatureText : null;
}

/**
 * Parse signature block to extract structured data.
 */
export function parseSignatureBlock(signatureText: string, senderAddress: string): ExtractedSignature {
  const result: ExtractedSignature = {
    phone: null,
    title: null,
    company: null,
    urls: [],
    altEmails: [],
  };

  if (!signatureText) return result;

  const lines = signatureText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // Extract phone numbers using libphonenumber-js
  try {
    const phoneNumbers = findPhoneNumbersInText(signatureText, "US");
    if (phoneNumbers.length > 0) {
      // Use the first phone number found
      const phone = phoneNumbers[0];
      result.phone = phone.number.number;
    }
  } catch (err) {
    // Ignore phone parsing errors
  }

  // Extract URLs
  const urlRegex = /https?:\/\/[^\s]+/gi;
  const urls = signatureText.match(urlRegex) || [];
  // BUG-014: Filter out tracking/unsubscribe URLs
  result.urls = urls
    .map((url) => url.trim())
    .filter((url) => {
      const lower = url.toLowerCase();
      return (
        !lower.includes("unsubscribe") &&
        !lower.includes("tracking") &&
        !lower.includes("utm_") &&
        !lower.includes("utm_source") &&
        !lower.includes("utm_medium") &&
        !lower.includes("utm_campaign") &&
        !lower.includes("clicktracking") &&
        !lower.includes("emailtracking")
      );
    });

  // Extract alternative emails (exclude sender's own address)
  const emailRegex = /[\w.+-]+@[\w.-]+\.\w{2,}/gi;
  const emails = signatureText.match(emailRegex) || [];
  const senderLower = senderAddress.toLowerCase();
  result.altEmails = emails
    .map((e) => e.toLowerCase())
    .filter((e) => e !== senderLower);

  // Extract title/company from short lines matching patterns
  for (const line of lines) {
    if (line.length > 80) continue; // Skip long lines
    if (urlRegex.test(line)) continue; // Skip lines that are just URLs
    if (phoneRegex.test(line)) continue; // Skip lines that are just phone numbers

    // BUG-014: Reject boilerplate patterns
    const lowerLine = line.toLowerCase();
    
    // Reject copyright notices
    if (
      lowerLine.includes("(c)") ||
      lowerLine.includes("copyright") ||
      lowerLine.includes("©") ||
      lowerLine.match(/\(c\)\s*\d{4}/)
    ) {
      continue;
    }
    
    // Reject mailing addresses (patterns like street addresses, ZIP codes)
    if (
      lowerLine.match(/\d+\s+[a-z\s]+(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|way|place|pl|lane|ln)[\s,]/i) ||
      lowerLine.match(/\d{5}(-\d{4})?/i) || // ZIP code
      lowerLine.match(/[a-z\s]+,\s*[a-z]{2}\s+\d{5}/i) // City, State ZIP
    ) {
      continue;
    }

    // Pattern: "Title, Company"
    const commaMatch = line.match(/^(.+?),\s*(.+)$/);
    if (commaMatch) {
      const [, titlePart, companyPart] = commaMatch;
      // BUG-014: Additional validation - reject if looks like boilerplate
      const titleLower = titlePart.toLowerCase().trim();
      const companyLower = companyPart.toLowerCase().trim();
      if (
        titleLower.length < 50 &&
        companyLower.length < 50 &&
        !titleLower.match(/\(c\)|copyright|©/) &&
        !companyLower.match(/\d+\s+[a-z\s]+(street|st|avenue|ave)/i) &&
        !companyLower.match(/\d{5}/) // No ZIP codes
      ) {
        result.title = titlePart.trim();
        result.company = companyPart.trim();
        break;
      }
    }

    // Pattern: "Title | Company"
    const pipeMatch = line.match(/^(.+?)\s*\|\s*(.+)$/);
    if (pipeMatch) {
      const [, titlePart, companyPart] = pipeMatch;
      const titleLower = titlePart.toLowerCase().trim();
      const companyLower = companyPart.toLowerCase().trim();
      if (
        titleLower.length < 50 &&
        companyLower.length < 50 &&
        !titleLower.match(/\(c\)|copyright|©/) &&
        !companyLower.match(/\d+\s+[a-z\s]+(street|st|avenue|ave)/i) &&
        !companyLower.match(/\d{5}/)
      ) {
        result.title = titlePart.trim();
        result.company = companyPart.trim();
        break;
      }
    }

    // Pattern: "Title at Company"
    const atMatch = line.match(/^(.+?)\s+at\s+(.+)$/i);
    if (atMatch) {
      const [, titlePart, companyPart] = atMatch;
      const titleLower = titlePart.toLowerCase().trim();
      const companyLower = companyPart.toLowerCase().trim();
      if (
        titleLower.length < 50 &&
        companyLower.length < 50 &&
        !titleLower.match(/\(c\)|copyright|©/) &&
        !companyLower.match(/\d+\s+[a-z\s]+(street|st|avenue|ave)/i) &&
        !companyLower.match(/\d{5}/)
      ) {
        result.title = titlePart.trim();
        result.company = companyPart.trim();
        break;
      }
    }
  }

  return result;
}

const phoneRegex = /[\d\s().-]{10,}/; // Simple phone pattern for filtering

/**
 * Extract signature data from email body.
 * Returns null if no signature found, otherwise returns extracted data.
 */
export function extractSignatureData(
  bodyText: string,
  senderAddress: string
): ExtractedSignature | null {
  const signatureText = extractSignature(bodyText);
  if (!signatureText) return null;

  return parseSignatureBlock(signatureText, senderAddress);
}
