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
| **Phase 7** | #14 (@kbve/devops integration), #15 (descriptive PR titles)     | Done   |

---

## Remaining — Utils Workflow Hardening

### #16. Add permissions + timeouts to utils-\* workflows

**Priority:** Medium

**Problem:** 10 reusable `utils-*` workflows lack `permissions: {}`, `timeout-minutes`, and `concurrency` blocks. While they inherit some protections from calling workflows, defense-in-depth is better.

**Workflows to harden:**
- `utils-flyio-deployment.yml`
- `utils-generate-matrix.yml`
- `utils-godot-itch-build-pipeline.yml`
- `utils-unity-azure-deployment.yml`
- `utils-astro-deployment.yml`
- `utils-npm-publish.yml`
- `utils-nx-kbve-shell.yml`
- `utils-file-alterations.yml`
- `utils-update-kube-manifest.yml`
- `utils-publish-docker-image.yml`
- `utils-python-publish.yml`

**Changes per file:**
- Add `timeout-minutes` to all jobs (5 min for quick, 30 for builds, 60 for heavy)
- Add per-job `permissions` with minimal scopes

### #17. Add permissions to ci-dev.yml, ci-staging.yml, ci-main.yml

**Priority:** Medium

**Problem:** These 3 workflows lack top-level `permissions: {}` deny-all. Only ci-atom.yml and ci-security.yml have it.

---

## Implementation Order

| Phase       | Items    | Status                                |
| ----------- | -------- | ------------------------------------- |
| **Phase 8** | #16, #17 | Pending — utils + ci hardening sweep  |
