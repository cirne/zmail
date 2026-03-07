# OPP-013: Name Inference from Email Addresses

**Status:** Partial — Dot/underscore patterns work, firstlast (no separator) still returns null.

**Problem:** Many contacts show `name: null` despite inferable names. Contacts with significant interaction history show `name: null` when no display name was found in email headers, but many of these have names clearly embedded in the email address.

**Example:** 
```bash
zmail who "greenlonghorninc.com"
```
Returns entries like:
```json
{ "name": null, "primaryAddress": "alanfinley@greenlonghorninc.com", "receivedCount": 18 }
{ "name": null, "primaryAddress": "sjohnson@greenlonghorninc.com", "receivedCount": 14 }
```

Also:
```json
{ "name": null, "primaryAddress": "lewis.cirne@alum.dartmouth.org", "receivedCount": 33 }
{ "name": null, "primaryAddress": "katelyn.cirne@gmail.com", "receivedCount": 2 }
```

**Proposed direction:** Infer display names from email addresses as a fallback when no header name exists:
- ✅ `lewis.cirne@...` → "Lewis Cirne" — *Working*
- ✅ `katelyn_cirne@...` → "Katelyn Cirne" — *Working*
- ⚠️ `alanfinley@...` → "Alan Finley" — *Not yet working (firstlast without separator)*
- ✅ `sjohnson@...` → null (ambiguous) — *Working as intended*

**Implemented patterns:** `firstname.lastname`, `firstname_lastname`, camelCase (`lewisCirne`).

**Remaining:** `firstnamelastname` (no separator) — requires dictionary or better heuristics.

Mark inferred names distinctly (e.g., `"nameSource": "inferred"`) so agents know confidence level.

**Open questions:**
- How to handle ambiguous cases (e.g., `sjohnson` could be "S Johnson" or "Sjohn Son")?
- Should inferred names be used for identity merging, or only for display?
- What confidence threshold should trigger inference vs leaving null?

---

## Impact

- `name: null` makes results harder to scan and match
- `lewis.cirne@alum.dartmouth.org` should merge with Lewis Cirne but can't because it has no name
- For an address-book replacement, unnamed contacts feel like data gaps

---

## Benefits

- Enables identity merging for addresses without display names (fixes [BUG-011](../bugs/archive/BUG-011-who-dartmouth-not-merged.md))
- Improves scanability of `who` results
- Reduces data gaps in the address book experience
- Low effort, high impact improvement

---

## Implementation Notes

- Parse local-part of email address for common name patterns
- Use capitalization heuristics (e.g., `lewis.cirne` → "Lewis Cirne")
- Handle edge cases (single letter prefixes, ambiguous names)
- Add `nameSource` field to distinguish inferred vs header names
- Consider using name inference for identity merging

---

## References

- Vision (agent-first): [VISION.md](../VISION.md)
- Related: [BUG-011](../bugs/archive/BUG-011-who-dartmouth-not-merged.md) — Dartmouth address not merged (would be fixed by this)
- Related: [OPP-012](../opportunities/OPP-012-who-smart-address-book.md) — Smart Address Book (includes identity merging)
