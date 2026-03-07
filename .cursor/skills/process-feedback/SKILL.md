---
name: process-feedback
description: Processes feedback from the sibling ztest project, checks for duplicates in existing bugs/opportunities, and converts new feedback into tracked bugs or opportunities. Use when processing feedback from ztest, converting agent-reported issues into documentation, or managing the feedback-to-bug/opportunity workflow.
---

# Process Feedback

Processes feedback files from `../ztest/feedback/` and converts them into bugs or opportunities in `docs/bugs/` and `docs/opportunities/`.

**IMPORTANT: Idempotency** — Assume feedback may have already been processed. Always check for existing bugs/opportunities before creating new ones. This workflow should be safe to run multiple times on the same feedback files.

## Workflow

### 1. Read Feedback Directory

List all markdown files in `../ztest/feedback/`:

```bash
ls -1 ../ztest/feedback/*.md
```

For each feedback file:
- Read the file content
- Extract key information (title, problem description, type: bug vs opportunity)
- Identify unique identifiers (keywords, phrases that would appear in existing docs)

### 2. Check for Existing Tracking (Idempotency Check)

**CRITICAL:** Before creating any new bugs/opportunities, verify the feedback hasn't already been processed. Assume feedback may have been processed in a previous run.

**First, check the processed feedback tracker:**
- Read `docs/feedback-processed.md` — this is the source of truth for processed feedback
- If the feedback filename appears in the tracker, it has already been processed → **Skip processing**
- Note the action taken and related bug/opportunity ID from the tracker

**Then, search existing documentation for semantic matches:**

**Check bugs:**
- Active bugs: `docs/bugs/*.md` (excluding archive)
- Archived bugs: `docs/bugs/archive/*.md`
- Index: `docs/BUGS.md`

**Check opportunities:**
- Active opportunities: `docs/opportunities/*.md` (excluding archive)
- Archived opportunities: `docs/opportunities/archive/*.md`
- Index: `docs/OPPORTUNITIES.md`

**Search strategy:**
- Read all bug/opportunity files (both active and archived)
- Compare feedback title/keywords with bug/opportunity titles and summaries
- Look for semantic similarity (same problem, same area of concern)
- Check if feedback describes something already fixed (in archive)
- **If a match is found, skip creating a new bug/opportunity** — the feedback has already been processed

### 3. Determine Action

For each feedback file:

**Already tracked (active):**
- If feedback matches an active bug/opportunity → **Skip processing** (already handled). Move feedback file to `submitted/` subdirectory.
- Optionally: Update existing bug/opportunity with additional context from feedback if it adds value

**Already fixed (archived):**
- If feedback matches an archived/fixed bug → Move feedback file to `submitted/` subdirectory (issue resolved, already processed)
- If feedback matches an archived/implemented opportunity → Move feedback file to `submitted/` subdirectory (feature delivered, already processed)

**New issue (no match found):**
- Only if feedback doesn't match any existing bug/opportunity (active or archived) → Convert to new bug or opportunity
- **Double-check**: Re-read bug/opportunity files to ensure no match was missed before creating new entry

### 4. Convert Feedback to Bug/Opportunity

**Determine type:**
- **Bug**: Describes a failure, broken behavior, or agent/user friction
- **Opportunity**: Describes an improvement, enhancement, or new feature idea

**Create new bug (only if no match found):**
1. **Verify no duplicate**: Re-check that no existing bug matches this feedback
2. Get next bug ID: Check `docs/bugs/` and `docs/bugs/archive/` for highest BUG-XXX number, increment
3. Create file: `docs/bugs/BUG-XXX-title-slug.md`
4. Format follows existing bug structure (see `docs/bugs/BUG-002-attachment-discoverability-and-read.md`)
5. Update `docs/BUGS.md` index

**Create new opportunity (only if no match found):**
1. **Verify no duplicate**: Re-check that no existing opportunity matches this feedback
2. Get next opportunity ID: Check `docs/opportunities/` and `docs/opportunities/archive/` for highest OPP-XXX number, increment
3. Create file: `docs/opportunities/OPP-XXX-title-slug.md`
4. Format follows existing opportunity structure (see `docs/opportunities/OPP-001-personalization.md`)
5. Update `docs/OPPORTUNITIES.md` index

**Bug format template:**
```markdown
# BUG-XXX: [Title] — Agent-Reported

**Status:** Open.

**Design lens:** [Agent-first](../../VISION.md) — [brief context]

**Reported context:** [Agent/environment details from feedback]

---

## Summary

[Problem description from feedback]

---

## What the agent did (and what happened)

[If available from feedback, otherwise omit]

---

## Root causes

[Analysis from feedback or your assessment]

---

## Recommendations (concise)

[Actionable items from feedback]

---

## References

- Vision (agent-first): [VISION.md](../../VISION.md)
- Related: [Any related bugs/opportunities]
```

**Opportunity format template:**
```markdown
# OPP-XXX: [Title]

**Problem:** [Problem statement from feedback]

**Example:** [Concrete example from feedback, if available]

**Proposed direction:** [Solution direction from feedback]

**Open questions:**
- [Any open questions from feedback or your analysis]
```

### 5. Clean Up

After processing:
- **Annotate feedback file with bug/opportunity ID** — Before moving to `submitted/`, add a note at the top of the feedback file indicating which bug or opportunity ID it relates to:
  - If matched existing bug/opportunity: Add `**Related:** BUG-XXX` or `**Related:** OPP-XXX` at the top
  - If created new bug/opportunity: Add `**Related:** BUG-XXX` or `**Related:** OPP-XXX` at the top
  - Format: Add as a frontmatter field or as a header note (e.g., `**Processed as:** BUG-XXX` or `**Related:** OPP-XXX`)
- **Update `docs/feedback-processed.md`** — add entry with filename, date, action taken, and related bug/opportunity ID
- **Move processed feedback to `submitted/` subdirectory** — prefer moving to `../ztest/feedback/submitted/` rather than deleting (preserves feedback for reference)
  - Create `../ztest/feedback/submitted/` directory if it doesn't exist: `mkdir -p ../ztest/feedback/submitted`
  - Move file: `mv ../ztest/feedback/<filename>.md ../ztest/feedback/submitted/<filename>.md`
- For duplicates or already-fixed items: Still move to `submitted/` rather than deleting (maintains audit trail)
- Update any indexes (`docs/BUGS.md`, `docs/OPPORTUNITIES.md`)

## Example Workflow

```bash
# 1. List feedback files
ls -1 ../ztest/feedback/*.md

# 2. Read a feedback file
cat ../ztest/feedback/ux-semantic-search-guidance.md

# 3. Search for duplicates
grep -r "semantic search" docs/bugs/ docs/opportunities/

# 4. If new, create bug/opportunity
# (follow templates above)

# 5. Update index files
# Edit docs/BUGS.md or docs/OPPORTUNITIES.md

# 6. Annotate feedback file with bug/opportunity ID
# Add "**Related:** BUG-XXX" or "**Related:** OPP-XXX" at the top of the feedback file
# Example: echo "**Related:** BUG-003\n\n$(cat ../ztest/feedback/ux-semantic-search-guidance.md)" > ../ztest/feedback/ux-semantic-search-guidance.md

# 7. Update processed feedback tracker
# Edit docs/feedback-processed.md

# 8. Move processed feedback to submitted/
mkdir -p ../ztest/feedback/submitted
mv ../ztest/feedback/ux-semantic-search-guidance.md ../ztest/feedback/submitted/ux-semantic-search-guidance.md
```

## Key Files

- Feedback source: `../ztest/feedback/*.md` (only process files in root, not in `submitted/`)
- **Processed feedback location:** `../ztest/feedback/submitted/` — move processed feedback here (preserves audit trail)
- **Processed feedback tracker:** `docs/feedback-processed.md` — source of truth for processed feedback
- Bug index: `docs/BUGS.md`
- Bug files: `docs/bugs/BUG-XXX-*.md`
- Opportunity index: `docs/OPPORTUNITIES.md`
- Opportunity files: `docs/opportunities/OPP-XXX-*.md`

## Notes

- **Idempotency**: This workflow must be safe to run multiple times. Always assume feedback may have already been processed. **First check `docs/feedback-processed.md`** — this is the primary source of truth for processed feedback. Then check both active and archived bugs/opportunities before creating new entries.
- **Processed feedback tracker**: Always update `docs/feedback-processed.md` after processing feedback. This file tracks all processed feedback with the action taken (bug created, opportunity created, ignored, etc.) and related IDs.
- **ID numbering**: Use sequential IDs (BUG-003, OPP-008, etc.). Check both `docs/bugs/` and `docs/bugs/archive/` (or `docs/opportunities/` and `docs/opportunities/archive/`) to find the highest number.
- **Title slugs**: Convert titles to lowercase, hyphenated slugs for filenames (e.g., "UX Issue: Search Guidance" → `ux-issue-search-guidance.md`)
- **Semantic matching**: When checking for duplicates, look for similar problems/areas, not just exact title matches. Read full bug/opportunity content, not just titles.
- **Archive check**: Always check archive directories — if something is already fixed/implemented, the feedback has been processed and should be moved to `submitted/`.
- **File cleanup**: Always move processed feedback to `../ztest/feedback/submitted/` rather than deleting. This preserves an audit trail and allows reference back to original feedback. Only process files in `../ztest/feedback/*.md` (not files already in `submitted/`).
- **Annotate with ID**: Before moving feedback to `submitted/`, annotate the feedback file itself with the bug or opportunity ID (e.g., `**Related:** BUG-XXX` or `**Related:** OPP-XXX`). This makes it easy to trace which bug/opportunity the feedback relates to when reviewing submitted feedback. Use the bug/opportunity ID, not the filename.
- **When in doubt**: If unsure whether feedback matches an existing bug/opportunity, err on the side of not creating a duplicate. Skip processing rather than risk duplicate entries.
