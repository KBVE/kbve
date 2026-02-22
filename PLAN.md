# Plan: CI/CD Pipeline Improvements

## Context

The three-tier CI/CD pipeline (`atom-* → dev → staging → main`) has solid architecture:
file alteration detection, matrix-based parallel builds, idempotent version-checked publishing,
and auto-generated categorized changelogs. A review of all 26 workflow files in
`.github/workflows/` identified **11 improvement areas** across testing, security, reliability,
and developer experience.

The most critical finding is that **no tests run until code reaches `main`**, meaning broken
code can flow through the entire promotion chain unchecked.

---

## 1. Add Test Gates on Dev and Staging Branches

**Priority:** High

**Problem:** `ci-dev.yml` and `ci-staging.yml` only create promotion PRs and detect file
alterations. Zero tests run on either branch. All testing is deferred to `ci-main.yml`, which
means broken code can be promoted from `dev → staging → main` without any validation.

**Solution:** Run the existing reusable test workflows as required status checks on PRs
targeting `staging` (from dev) and `main` (from staging):

- `npm-test-package.yml` for NPM packages
- `rust-test-crate.yml` for Rust crates
- `docker-test-app.yml` for Docker apps (Playwright e2e)
- `python-test-package.yml` for Python packages

Use the file alteration outputs to determine which test suites to invoke (same pattern as
`ci-main.yml`).

**Files:**
- `.github/workflows/ci-dev.yml` — add test jobs to `validate_pr` trigger
- `.github/workflows/ci-staging.yml` — add test jobs to `validate_staging_pr` trigger

---

## 2. Fill in the Stub `validate_pr` Job in ci-dev.yml

**Priority:** High

**Problem:** Lines 301-322 of `ci-dev.yml` contain placeholder echo statements with
`# Add any validation logic here` comments. The validation job does nothing.

**Solution:** Add actual validation logic:

- Run `nx affected --target=lint --base=staging --head=dev` to lint changed projects
- Run `nx affected --target=test --base=staging --head=dev` to unit test changed projects
- Optionally validate that version bumps exist for changed packages

**Files:**
- `.github/workflows/ci-dev.yml` — replace stub in `validate_pr` job

---

## 3. Add Test Checks Before Atomic Branch Auto-Merge

**Priority:** High

**Problem:** `ci-atom.yml` auto-approves and auto-merges PRs for authorized users with zero
test execution. Code goes directly from push to merged without any quality check.

**Solution:** Add a `test_changes` job between `create_pr` and `security_check`:

- Checkout the branch
- Run `nx affected --target=lint --base=dev`
- Run `nx affected --target=test --base=dev`
- Make `security_check` depend on `test_changes` succeeding

This ensures auto-merge only happens when tests pass.

**Files:**
- `.github/workflows/ci-atom.yml` — add test job, update `security_check.needs`

---

## 4. Add Security Scanning Workflows

**Priority:** Medium

**Problem:** No automated security scanning exists — no Dependabot for dependency updates,
no CodeQL/SAST for code analysis, and no container image vulnerability scanning.

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

## 5. Add Concurrency Controls

**Priority:** Medium

**Problem:** No `concurrency` groups on any workflow. Overlapping runs can conflict — for
example, two rapid pushes to `dev` can create duplicate PRs or race on branch comparisons.

**Solution:** Add `concurrency` blocks to all `ci-*.yml` workflows:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true  # for PR workflows
```

For `ci-main.yml`, use `cancel-in-progress: false` since production deployments should not
be cancelled.

**Files:**
- `.github/workflows/ci-dev.yml`
- `.github/workflows/ci-staging.yml`
- `.github/workflows/ci-main.yml`
- `.github/workflows/ci-atom.yml`

---

## 6. Add Job Timeout Limits

**Priority:** Low

**Problem:** No `timeout-minutes` on any jobs across all 26 workflows. Hung builds run until
GitHub's 6-hour default maximum.

**Solution:** Add `timeout-minutes` to all jobs with these defaults:

| Job Type | Timeout |
|----------|---------|
| PR creation / validation / summary | 10 min |
| Lint / unit tests | 30 min |
| Docker build + Rust compilation | 60 min |
| Unity / Godot builds | 90 min |

**Files:** All workflow files in `.github/workflows/`

---

## 7. Fix Sync Workflow Issue Spam

**Priority:** Low

**Problem:** `ci-sync.yml` creates a new GitHub issue every time `dev` is ahead of `main`
during sync. This is a normal, routine state that occurs between every release cycle, causing
issue accumulation.

**Solution:** Either:

- **(a)** Check for an existing open issue with the `sync-status` label before creating.
  Update the existing issue body instead of creating a duplicate.
- **(b)** Replace the issue creation with a `$GITHUB_STEP_SUMMARY` annotation — visible in
  the workflow run without cluttering the issues tab.

Option (b) is recommended as the simpler approach.

**Files:**
- `.github/workflows/ci-sync.yml` — modify `sync_dev_with_main` job

---

## 8. Fix CryptoThrone pnpm Version Mismatch

**Priority:** Low

**Problem:** `ci-main.yml` line 367 sets `version: 9` for the CryptoThrone build while every
other job in the pipeline uses `version: 10`.

**Solution:** Update to `version: 10` for consistency.

**Files:**
- `.github/workflows/ci-main.yml` — CryptoThrone `Setup pnpm` step

---

## 9. Fix Kube Manifest Update Circular Dependency

**Priority:** Medium

**Problem:** `utils-update-kube-manifest.yml` creates PRs targeting `dev` after Docker images
are published from `main`. These manifest-only PRs must then flow `dev → staging → main`
again, creating a circular loop for what is a deterministic, automated change.

**Solution options:**

- **(a)** Commit manifest updates directly to `dev` (no PR) since they are automated and
  deterministic — ArgoCD will pick up the change once it reaches `main`
- **(b)** Push to an `atom-kube-*` branch for auto-merge fast-tracking
- **(c)** Push manifest updates directly to `main` and rely on `ci-sync.yml` to propagate
  back — avoids the round trip entirely

Recommended: Option (b) — leverages the existing atom workflow, preserves review trail, and
avoids direct pushes to `main`.

**Files:**
- `.github/workflows/utils-update-kube-manifest.yml` — change branch and PR target

---

## 10. Add Pre-commit Hooks for Local Quality Gates

**Priority:** Low

**Problem:** No local enforcement of code quality. Linting and formatting only run in CI
(and currently not even on `dev`/`staging`).

**Solution:** Add husky + lint-staged for lightweight pre-commit checks:

- Run ESLint on staged `.ts`, `.tsx`, `.js`, `.jsx`, `.astro` files
- Run Prettier on staged files
- Run `cargo fmt --check` on staged `.rs` files (if Rust toolchain is available)

Keep it fast — only check staged files, not the entire repo.

**Files:**
- `package.json` — add `husky` and `lint-staged` devDependencies + config
- `.husky/pre-commit` (new)

---

## 11. Update AGENTS.md to Document Atom Branch Workflow

**Priority:** Medium

**Problem:** `AGENTS.md` only documents the `trunk/<task-name>-<MM-DD-YYYY>` worktree pattern.
The `atom-*` branch workflow — which has full CI automation (`ci-atom.yml`: auto-PR creation,
auto-approval, auto-merge for authorized users, auto-cleanup) — is completely undocumented.
Developers and agents have no way to discover this faster workflow.

**Solution:** Add an "Atomic Branches" section to `AGENTS.md` covering:

- **When to use:** Small, self-contained changes (docs, config, single-file fixes) that don't
  need a full worktree
- **Naming convention:** `atom-<description>` (max 50 chars, alphanumeric + hyphens only)
- **Reserved names:** `atom-main`, `atom-dev`, `atom-master` are blocked
- **Workflow:** Push triggers auto-PR to `dev`, authorized users get auto-merge (squash)
- **When to use trunk/ instead:** Multi-commit features, work requiring iterative testing,
  or changes spanning many files

**Files:**
- `AGENTS.md` — add new section

---

## Implementation Order

| Phase | Suggestions | Rationale |
|-------|-------------|-----------|
| **Phase 1** | #1, #2, #3 | Testing gaps — highest impact on code quality |
| **Phase 2** | #5, #6, #8 | Quick reliability wins — small changes, big safety net |
| **Phase 3** | #9, #11 | Workflow improvements — fix circular dep, document atom branches |
| **Phase 4** | #4, #7, #10 | Security + polish — Dependabot, issue spam, pre-commit hooks |
