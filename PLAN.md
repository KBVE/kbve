# Plan: CI/CD Pipeline Improvements

## Context

The three-tier CI/CD pipeline (`atom-* → dev → staging → main`) has solid architecture:
file alteration detection, matrix-based parallel builds, idempotent version-checked publishing,
and auto-generated categorized changelogs. A review of all 26 workflow files in
`.github/workflows/` identified improvement areas across testing, security, reliability,
and developer experience.

---

## Completed

### ~~#1. Add Test Gates on Dev and Staging Branches~~ ✓

Added `nx affected --target=lint` and `nx affected --target=test` to `validate_pr` in
`ci-dev.yml` (base: staging, head: dev) and `validate_staging_pr` in `ci-staging.yml`
(base: main, head: staging). Both jobs now run lint + unit tests on PRs before promotion.

### ~~#2. Fill in the Stub `validate_pr` Job in ci-dev.yml~~ ✓

Replaced the placeholder echo statements in `ci-dev.yml` `validate_pr` with real Node/pnpm
setup, dependency install, and `nx affected` lint + test runs.

### ~~#3. Add Test Checks Before Atomic Branch Auto-Merge~~ ✓

Hardened `ci-atom.yml` with: `authorize_actor` gate (checks GitHub actor ID), `run_tests`
job (lint + test via `nx affected`), top-level `concurrency` group, deny-all `permissions: {}`
with per-job grants, `timeout-minutes` on all jobs, and standardized all actions to `@v8`.

### ~~#5. Add Concurrency Controls~~ ✓

Added `concurrency` groups to `ci-dev.yml`, `ci-staging.yml` (both `cancel-in-progress: true`)
and `ci-main.yml` (`cancel-in-progress: false` — production deploys should not be cancelled).
`ci-atom.yml` already had concurrency from #3.

### ~~#6. Add Job Timeout Limits~~ ✓

Added `timeout-minutes` to all direct jobs in `ci-dev.yml` (10 min PR creation, 30 min
validation), `ci-staging.yml` (10 min PR creation, 30 min validation), and `ci-main.yml`
(10 min globals/deploy, 30 min CryptoThrone). `ci-atom.yml` already had timeouts from #3.
Matrix-based jobs inherit timeouts from their reusable workflow definitions.

### ~~#8. Fix CryptoThrone pnpm Version Mismatch~~ — Dismissed

CryptoThrone will be migrated into the general ecosystem later, making this a non-issue.

---

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

### #9. Fix Kube Manifest Update Circular Dependency

**Priority:** Medium

**Problem:** `utils-update-kube-manifest.yml` creates PRs targeting `dev` after Docker images
are published from `main`, creating a circular promotion loop.

**Solution:** Push to an `atom-kube-*` branch for auto-merge fast-tracking. Leverages the
existing (now hardened) atom workflow, preserves review trail, avoids direct pushes to `main`.

**Files:**
- `.github/workflows/utils-update-kube-manifest.yml` — change branch and PR target

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

### #11. Update AGENTS.md to Document Atom Branch Workflow

**Priority:** Medium

**Problem:** `AGENTS.md` only documents the `trunk/<task-name>-<MM-DD-YYYY>` worktree pattern.
The `atom-*` branch workflow is completely undocumented.

**Solution:** Add an "Atomic Branches" section to `AGENTS.md` covering:

- **When to use:** Small, self-contained changes (docs, config, single-file fixes)
- **Naming convention:** `atom-<description>` (max 50 chars, alphanumeric + hyphens only)
- **Reserved names:** `atom-main`, `atom-dev`, `atom-master` are blocked (exact match)
- **Workflow:** Push triggers auto-PR to `dev`, authorized users get auto-merge (squash)
- **When to use trunk/ instead:** Multi-commit features, iterative testing, many files

**Files:**
- `AGENTS.md` — add new section

---

## Implementation Order

| Phase | Items | Status |
|-------|-------|--------|
| **Phase 1** | #1, #2, #3 | ✓ Complete |
| **Phase 2** | #5, #6 | ✓ Complete |
| **Phase 3** | #9, #11 | Next — workflow improvements |
| **Phase 4** | #4, #7, #10 | Security + polish |
