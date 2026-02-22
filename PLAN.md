# Plan: CI/CD Pipeline Improvements

## Remaining

### #4. Add Security Scanning Workflows

**Priority:** Medium

**Problem:** No automated security scanning — no Dependabot, no CodeQL/SAST, no container
image vulnerability scanning.

**Solution:**

- **Dependabot:** Add `.github/dependabot.yml` with update schedules for npm, pip, cargo,
  github-actions, and docker ecosystems
- **CodeQL:** Add `.github/workflows/ci-security.yml` with CodeQL analysis for JavaScript,
  TypeScript, and Python on pushes to `dev`/`main` and on PRs
- **Container scanning:** Add a Trivy or Grype scan step in `utils-publish-docker-image.yml`
  after the Docker build, before the push

**Files:**
- `.github/dependabot.yml` (new)
- `.github/workflows/ci-security.yml` (new)
- `.github/workflows/utils-publish-docker-image.yml` — add scan step

---

### #7. Fix Sync Workflow Issue Spam

**Priority:** Low

**Problem:** `ci-sync.yml` creates a new GitHub issue every time `dev` is ahead of `main`
during sync — a normal state between releases, causing issue accumulation.

**Solution:** Replace issue creation with `$GITHUB_STEP_SUMMARY` annotation — visible in
the workflow run without cluttering the issues tab.

**Files:**
- `.github/workflows/ci-sync.yml` — modify `sync_dev_with_main` job

---

### #10. Add Pre-commit Hooks for Local Quality Gates

**Priority:** Low

**Problem:** No local enforcement of code quality. Linting and formatting only run in CI.

**Solution:** Add husky + lint-staged for lightweight pre-commit checks:

- Run ESLint on staged `.ts`, `.tsx`, `.js`, `.jsx`, `.astro` files
- Run Prettier on staged files
- Run `cargo fmt --check` on staged `.rs` files (if Rust toolchain is available)

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
| **Phase 4** | #4, #7, #10 | Next — security + polish |
