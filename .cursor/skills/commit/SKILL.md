---
name: commit
description: Pre-commit checklist to ensure code quality, test coverage, linting, and documentation accuracy. Use when preparing commits, reviewing changes before commit, or when the user asks about commit requirements or pre-commit checks.
---

# Commit Checklist

Before committing any changes, verify all items in this checklist are satisfied.

## Pre-Commit Checklist

### 1. Test Coverage
- [ ] **For any new/changed code, ensure there is test coverage**
  - New functions, classes, or modules have corresponding tests
  - Changed behavior is covered by updated or new tests
  - Edge cases and error paths are tested
  - Use `npm test` to verify tests exist and pass

### 2. Linting
- [ ] **Lint must be clean**
  - Run `npm run lint` (which runs `tsc --noEmit`)
  - Fix all TypeScript errors and warnings
  - No type errors, unused variables, or other linting issues

### 3. Tests
- [ ] **All tests must pass**
  - Run `npm test` and verify all tests pass
  - No failing tests, no skipped tests (unless intentionally)
  - Test output shows all green checkmarks

### 4. Documentation Review
- [ ] **Ensure all docs are up to date and reflect the source**
  - Review relevant documentation files (AGENTS.md, README.md, docs/*.md)
  - Update docs if functionality changed
  - **Always have one source of truth in documentation** — other docs should refer to it as necessary (DRY principle)
  - If adding new features, update appropriate docs
  - If changing behavior, update docs that describe that behavior
  - Cross-reference related docs rather than duplicating information

## Quick Commands

```bash
# Run linting
npm run lint

# Run tests
npm test

# Run both (recommended before commit)
npm run lint && npm test
```

## Documentation DRY Principle

When updating documentation:

1. **Identify the canonical source** — Where does this fact live? (e.g., AGENTS.md for commands, ARCHITECTURE.md for technical decisions)
2. **Update the canonical source** — Make changes there first
3. **Reference, don't duplicate** — Other docs should link to or reference the canonical source
4. **Remove duplicates** — If you find duplicated information, consolidate it into the canonical source and update references

Example:
- ✅ Good: "See [AGENTS.md](AGENTS.md) for installation instructions"
- ❌ Bad: Copying installation instructions into multiple files

## When to Skip Items

Only skip checklist items if:
- The change is **purely cosmetic** (whitespace, formatting with no logic changes)
- The change is **documentation-only** (updating docs without code changes)
- You're explicitly told to skip (e.g., WIP commits, experimental branches)

For any code changes (even small ones), all checklist items apply.

## Final Step: Commit and Push

**When all checklist items are complete, tests and lint are clean, then commit and push:**

1. Stage your changes: `git add .`
2. Commit with a descriptive message: `git commit -m "your message"`
3. Push to remote: `git push`

Only proceed to commit and push after verifying:
- ✅ All checklist items are satisfied
- ✅ `npm run lint` passes with no errors
- ✅ `npm test` passes with all tests green
- ✅ Documentation is updated and follows DRY principles
