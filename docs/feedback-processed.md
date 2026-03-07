# Processed Feedback

This file tracks feedback files from `../ztest/feedback/` that have been processed. A feedback item is considered "processed" when we have decided what to do with it and completed that action (ignore, create bug, create opportunity, update docs, etc.).

**Format:** Each entry includes:
- Feedback filename
- Date processed
- Action taken (bug created, opportunity created, ignored, etc.)
- Related bug/opportunity ID (if applicable)

---

## Processed Items

| Feedback File | Date Processed | Action | Related ID |
|---|---|---|---|
| `ux-semantic-search-guidance.md` | 2026-03-06 | Created bug | [BUG-003](bugs/archive/BUG-003-fts-vs-semantic-search-guidance.md) — Superseded by OPP-008 |
| `ux-simplify-search-modes.md` | 2026-03-06 | Created opportunity | [OPP-008](opportunities/archive/OPP-008-simplify-search-modes.md) — Implemented 2026-03-06 |
| `bug-attachment-read-silent-failure.md` | 2026-03-06 | Created bug | [BUG-004](bugs/archive/BUG-004-attachment-read-silent-failure.md) |
| `bug-xlsx-object-object-rendering.md` | 2026-03-06 | Created bug | [BUG-005](bugs/archive/BUG-005-xlsx-formula-cells-object-object.md) |
| `bug-sync-repeated-connecting-message.md` | 2026-03-07 | Created bug | [BUG-006](bugs/archive/BUG-006-sync-repeated-connecting-message.md) |
| `bug-sync-silent-auth-failure.md` | 2026-03-07 | Created bug | [BUG-007](bugs/archive/BUG-007-sync-silent-auth-failure.md) |
| `bug-who-case-sensitive-email-dedup.md` | 2026-03-07 | Created bug | [BUG-008](bugs/archive/BUG-008-who-case-sensitive-email-dedup.md) |
| `bug-wizard-crash-non-interactive.md` | 2026-03-07 | Created bug | [BUG-009](bugs/archive/BUG-009-wizard-crash-non-interactive.md) |
| `feature-who-smart-address-book.md` | 2026-03-07 | Created opportunity | [OPP-012](opportunities/OPP-012-who-smart-address-book.md) |
| `bug-sync-backward-resume-skips-date-range.md` | 2026-03-07 | Created bug | [BUG-010](bugs/archive/BUG-010-sync-backward-resume-skips-date-range.md) |
| `bug-who-dartmouth-not-merged.md` | 2026-03-07 | Created bug | [BUG-011](bugs/archive/BUG-011-who-dartmouth-not-merged.md) |
| `bug-who-min-sent-splits-identity.md` | 2026-03-07 | Created bug | [BUG-012](bugs/archive/BUG-012-who-min-sent-splits-identity.md) |
| `bug-who-noreply-display-name-leaks.md` | 2026-03-07 | Created bug | [BUG-013](bugs/archive/BUG-013-who-noreply-display-name-leaks.md) |
| `bug-who-signature-parser-noise.md` | 2026-03-07 | Created bug | [BUG-014](bugs/archive/BUG-014-who-signature-parser-noise.md) |
| `ux-who-name-inference-from-address.md` | 2026-03-07 | Created opportunity | [OPP-013](opportunities/OPP-013-who-name-inference-from-address.md) — Partial: dot/underscore patterns work, firstlast (no separator) still null |
| `bug-who-name-inference-noreply-garbage.md` | 2026-03-07 | Created bug | [BUG-015](bugs/archive/BUG-015-who-name-inference-noreply-garbage.md) |

---

## Notes

- This file serves as the source of truth for which feedback has been processed
- Always check this file first before processing feedback to avoid duplicates
- After processing feedback, add an entry here and optionally delete/move the feedback file
- Feedback files can be safely deleted after processing if they're tracked here
