# Plan: CI/CD Pipeline Improvements

## Completed

| Phase       | Items                                                           | Status |
| ----------- | --------------------------------------------------------------- | ------ |
| **Phase 1** | #1 (test gate dev), #2 (test gate staging), #3 (test gate atom) | Done   |
| **Phase 2** | #5 (concurrency), #6 (timeouts)                                 | Done   |
| **Phase 3** | #9 (kube manifest fix), #11 (AGENTS.md docs)                    | Done   |
| **Phase 4** | #4 (Dependabot + CodeQL + Trivy), #7 (sync issue spam)          | Done   |
| **Phase 5** | #10 (husky + lint-staged pre-commit hooks)                      | Done   |
| **Phase 6** | #12 (grammar fix), #13 (category sync)                          | Done   |

---

## Remaining — DevOps Library Improvements

### #14. Use @kbve/devops Library for PR Body Generation

**Priority:** High

**Problem:** Both `ci-dev.yml` and `ci-staging.yml` duplicate conventional commit parsing inline. The `@kbve/devops` library already has `_$gha_fetchAndCleanCommits()` and `_$gha_formatCommits()` that handle this properly with 13 categories and KBVE branding.

**Solution:** Replace inline commit categorization with a reusable workflow step that calls `@kbve/devops` functions. This centralizes the logic and makes future changes to the format apply everywhere.

**Approach options:**

1. Import `@kbve/devops` in an `actions/github-script` step
2. Create a small Node script that imports and runs the devops functions
3. Build a reusable composite action that wraps the devops library

**Files:**

- `.github/workflows/ci-dev.yml` — `dev_to_staging_pr` job
- `.github/workflows/ci-staging.yml` — `staging_to_main_pr` job
- Possibly `packages/npm/devops/` — if GHA-specific exports need adjustment

---

### #15. Improve PR Titles to Be Descriptive

**Priority:** Low

**Problem:** PR titles are generic ("Release: Dev → Staging"). They don't convey what changed.

**Solution:** Generate descriptive PR titles summarizing the changes, e.g.:

- "Release: 2 features, 1 fix → Staging"
- "Release: auth system + bug fixes → Main"

Could add a title generator to `@kbve/devops` library.

**Files:**

- `.github/workflows/ci-dev.yml` — PR title in `dev_to_staging_pr`
- `.github/workflows/ci-staging.yml` — PR title in `staging_to_main_pr`
- Possibly `packages/npm/devops/` — new title generation function

---

## Implementation Order

| Phase       | Items    | Status                                      |
| ----------- | -------- | ------------------------------------------- |
| **Phase 7** | #14, #15 | Pending — requires @kbve/devops integration |
