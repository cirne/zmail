/**
 * Infer display names from email addresses when no header name exists.
 * Common patterns: firstname.lastname, firstnamelastname, firstname_lastname, flastname
 */

/**
 * Infers a display name from an email address local-part.
 * Returns null if the pattern is ambiguous or can't be inferred.
 * 
 * Examples:
 * - `lewis.cirne` -> "Lewis Cirne"
 * - `katelyn_cirne` -> "Katelyn Cirne"
 * - `alanfinley` -> "Alan Finley"
 * - `sjohnson` -> null (ambiguous: could be "S Johnson" or "Sjohn Son")
 */
export function inferNameFromAddress(address: string): string | null {
  // Strip +aliases before inferring (e.g., "lewis+work" -> "lewis")
  let localPart = address.split("@")[0].toLowerCase();
  if (localPart.includes("+")) {
    localPart = localPart.split("+")[0];
  }
  
  // Pattern 1: firstname.lastname or firstname_lastname
  const dotOrUnderscoreMatch = localPart.match(/^([a-z]+)[._]([a-z]+)$/);
  if (dotOrUnderscoreMatch) {
    const [, first, last] = dotOrUnderscoreMatch;
    // Skip if either part is too short (likely not a name)
    if (first.length >= 2 && last.length >= 2) {
      return capitalizeWords(`${first} ${last}`);
    }
  }
  
  // Pattern 2: firstnamelastname (camelCase detection)
  // Look for transition from lowercase to uppercase (e.g., "lewisCirne")
  // Note: localPart is already lowercased, so we need to check the original
  const originalLocalPart = address.split("@")[0];
  const camelCaseMatch = originalLocalPart.match(/^([a-z]+)([A-Z][a-z]+)$/);
  if (camelCaseMatch) {
    const [, first, last] = camelCaseMatch;
    if (first.length >= 2 && last.length >= 2) {
      return capitalizeWords(`${first.toLowerCase()} ${last.toLowerCase()}`);
    }
  }
  
  // Pattern 3: firstnamelastname (all lowercase, try to split)
  // This is harder - we'll try common patterns
  // Prefer longer first names (4-6 chars) over shorter ones
  // Skip common non-name words
  const skipWords = ["the", "my", "our", "new", "old", "recipient", "sender", "user", "admin", "support", "info", "contact", "mail", "email", "noreply", "no-reply"];
  
  // Check if entire local-part is a skip word
  if (skipWords.includes(localPart)) {
    return null;
  }
  
  // Pattern 4: Check for single-letter prefix FIRST (before trying to split)
  // This matches patterns like "sjohnson" - return null for ambiguous cases
  const singleLetterMatch = localPart.match(/^([a-z])([a-z]{4,})$/);
  if (singleLetterMatch) {
    return null; // Ambiguous - could be "S Johnson" or "Sjohn Son"
  }
  
  // Try longer first names first (prefer 4-6 chars, then 3, then 7)
  // But require both parts to be reasonable lengths
  // Collect all valid splits and pick the best one
  const validSplits: Array<{ first: string; last: string; score: number }> = [];
  const firstLengths = [4, 5, 6, 3, 7]; // Prefer 4-6 char first names
  for (const i of firstLengths) {
    if (localPart.length < i + 4) continue; // Need at least 4 chars for last name
    const first = localPart.slice(0, i);
    const last = localPart.slice(i);
    
    // Heuristic: both parts should be reasonable name lengths
    // First: 3-7 chars, Last: 4+ chars
    if (first.length >= 3 && first.length <= 7 && last.length >= 4) {
      // Skip common non-name prefixes
      if (skipWords.includes(first)) continue;
      // Additional check: first part should start with a letter that's commonly a name start
      if (skipWords.some(w => localPart.startsWith(w))) continue;
      
      // Score splits: prefer 4-6 char first names, longer last names
      let score = 0;
      if (first.length >= 4 && first.length <= 6) score += 10; // Prefer common first name lengths
      if (last.length >= 5) score += 5; // Prefer longer last names
      score += last.length; // Longer last names are better
      
      validSplits.push({ first, last, score });
    }
  }
  
  // Return the best split (highest score)
  if (validSplits.length > 0) {
    validSplits.sort((a, b) => b.score - a.score);
    const best = validSplits[0];
    return capitalizeWords(`${best.first} ${best.last}`);
  }
  
  return null;
}

/**
 * Capitalize words (first letter uppercase, rest lowercase).
 */
function capitalizeWords(str: string): string {
  return str
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
