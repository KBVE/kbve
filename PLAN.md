# Plan: CI/CD Pipeline Improvements

## Remaining

### #10. Add Pre-commit Hooks for Local Quality Gates

**Priority:** Low

**Problem:** No local enforcement of code quality. Linting and formatting only run in CI.

**Solution:** Add husky + lint-staged for lightweight pre-commit checks:

- Run ESLint on staged `.ts`, `.tsx`, `.js`, `.jsx`, `.astro` files
- Run Prettier on staged files
- Run `cargo fmt --check` on staged `.rs` files (if Rust toolchain is available)

**Note:** Requires `pnpm add -D husky lint-staged` which modifies the lockfile —
use a trunk worktree, not an atom branch.

**Files:**
- `package.json` — add `husky` and `lint-staged` devDependencies + config
- `.husky/pre-commit` (new)

---

## Implementation Order

| Phase | Items | Status |
|-------|-------|--------|
| **Phase 1** | #1, #2, #3 | Done |
| **Phase 2** | #5, #6 | Done |
| **Phase 3** | #9, #11 | Done |
| **Phase 4** | #4, #7 | Done |
| **Phase 5** | #10 | Pending — requires trunk worktree |
