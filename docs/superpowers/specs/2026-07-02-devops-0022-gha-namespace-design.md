# @kbve/devops v0.0.22 — `gha` grouped namespace (retire `_$gha_*`)

**Date:** 2026-07-02
**Package:** `packages/npm/devops`
**Version target:** 0.0.21 → 0.0.22
**Compat stance:** Additive, non-breaking. Every existing `_$gha_*` export and the top-level `ci` namespace keep working. New: a single `gha` aggregator namespace with clean grouped members.

## Motivation

The GitHub-Actions helper surface is a flat set of 33 `_$gha_*`-prefixed exports across `issues.ts`, `pulls.ts`, `ci-failure.ts`, `actions.ts`, `docker.ts`, `types.ts`. The prefix is noisy at call sites and undiscoverable via autocomplete. v0.0.21 already proved the target pattern for one module (`ci.*` object + `_$gha_*` `@deprecated` aliases). v0.0.22 extends that pattern across the whole surface under one aggregator, `gha`, so a consumer writes `gha.issues.createComment(...)` and finds everything from one import.

A second win: `issues.ts`, `pulls.ts`, `docker.ts`, `types.ts` are **not currently reachable from the package entrypoint** (only `ci-failure`, `actions`, `retry` are wired into `src/index.ts`). Exporting `gha` wires the entire helper surface into the public API for the first time.

## Design

### The `gha` aggregator

One object, exported from the package root, grouping helpers by GitHub domain. Members strip the redundant module prefix (the group conveys context). Each member points at the module's plain-named function; the `_$gha_*` names remain as `@deprecated` aliases to the same functions.

```ts
import { gha } from '@kbve/devops';

gha.ci        // === the existing `ci` object (unchanged; also still exported top-level)
gha.issues
gha.actions
gha.pulls
gha.docker
gha.context
gha.withRetry // === withGitHubRetry (v0.0.21)
```

### Member map (clean name ← current `_$gha_*`)

`gha.ci` — reuse the existing `ci` object verbatim (`issueTitle`, `parseFailureLog`, `classifyFailure`, `classifyAll`, `buildIssueBody`, `buildComment`, `buildResolveComment`, `incrementHistory`, `failurePatterns`).

`gha.issues` (from `issues.ts`):
| member | ← alias |
|---|---|
| `createComment` | `_$gha_createIssueComment` |
| `addReaction` | `_$gha_addReaction` |
| `removeLabel` | `_$gha_removeLabel` |
| `addLabel` | `_$gha_addLabel` |
| `verifyMatrixLabel` | `_$gha_verifyMatrixLabel` |
| `addAssignees` | `_$gha_addAssignees` |
| `removeAssignees` | `_$gha_removeAssignees` |
| `closeIssue` | `_$gha_closeIssue` |
| `reopenIssue` | `_$gha_reopenIssue` |
| `lockIssue` | `_$gha_lockIssue` |
| `unlockIssue` | `_$gha_unlockIssue` |

`gha.actions` (from `actions.ts`):
| member | ← alias |
|---|---|
| `findActionInTitle` | `_$gha_findActionInTitle` |
| `kbveActionProcess` | `_$gha_kbve_ActionProcess` |
| `findActionInTitleSafe` | *(v0.0.21, already plain)* |

`gha.pulls` (from `pulls.ts`):
| member | ← alias |
|---|---|
| `formatCommits` | `_$gha_formatCommits` |
| `categorizeApiCommits` | `_$gha_categorizeApiCommits` |
| `generatePRTitle` | `_$gha_generatePRTitle` |
| `formatDevBody` | `_$gha_formatDevBody` |
| `getPullRequestNumber` | `_$gha_getPullRequestNumber` |
| `updatePullRequestBody` | `_$gha_updatePullRequestBody` |
| `fetchAndCleanCommits` | `_$gha_fetchAndCleanCommits` |
| `processAndUpdatePR` | `_$gha_processAndUpdatePR` |
| `createOrUpdatePR` | `_$gha_createOrUpdatePR` |

`gha.docker` (from `docker.ts`):
| member | ← alias |
|---|---|
| `runContainer` | `_$gha_runDockerContainer` |
| `stopContainer` | `_$gha_stopDockerContainer` |

`gha.context` (from `types.ts`):
| member | ← alias |
|---|---|
| `extractIssue` | `_$gha_extractIssueContext` |
| `extractRepo` | `_$gha_extractRepoContext` |

`gha.withRetry` ← `withGitHubRetry` (v0.0.21).

### Per-module refactor pattern (the v0.0.21 `ci-failure` precedent)

For each module, apply the pattern `ci-failure.ts` already uses:

1. The function is defined with its **plain name** (rename the `_$gha_`-prefixed definition to the clean name).
2. Export a module-level group object literal (`issues`, `actions`, `pulls`, `docker`, `context`) binding clean member names to those functions.
3. Keep every `_$gha_*` name as an `@deprecated` `export const _$gha_X = cleanName;` alias, so nothing that imported the old name breaks.

Then a new `src/lib/client/github/gha.ts` imports the per-module group objects (and `ci`, `withGitHubRetry`) and assembles `export const gha = { ci, issues, actions, pulls, docker, context, withRetry }`.

### Entrypoint wiring

`src/index.ts` gains `export { gha } from './lib/client/github/gha';` (and keeps the existing `ci`, `actions`, `retry` exports). Top-level `ci` stays exactly as-is. The package-root smoke test (from v0.0.21) is extended to assert `gha.issues.createComment`, `gha.pulls.createOrUpdatePR`, `gha.docker.runContainer`, `gha.context.extractIssue`, `gha.actions.findActionInTitle`, `gha.ci.parseFailureLog`, and `gha.withRetry` are all functions, and that a representative `_$gha_*` alias still resolves.

## Non-goals

- No removal of any `_$gha_*` alias (that is a later minor, once consumers migrate).
- No behavior/signature changes to any function.
- No workflow YAML changes (the tracker re-wire, "PR B", remains separate and still deferred).
- No new helper functionality — this is a pure naming/grouping release.

## Testing

- Per-module: existing `*.spec.ts` stay green; where a module gains its group object, add a small test asserting the group member is the same reference as its `_$gha_*` alias (e.g. `expect(issues.createComment).toBe(_$gha_createIssueComment)`).
- New `gha.spec.ts`: asserts the full `gha` shape — every group present, representative members are functions, `gha.ci === ci`.
- Extend `src/index.spec.ts` for the entrypoint assertions above.
- Full `nx test devops` green; `nx build devops` green (proves `gha` resolves from the root).

## Release mechanics

- Bump only `apps/kbve/astro-kbve/src/content/docs/project/devops.mdx` `version: "0.0.21"` → `"0.0.22"`. `version.toml` untouched (CI marker).
- Regenerate `.github/ci-dispatch-manifest.json` via `nx run astro-kbve:gen:ci-manifest` (devops-only change expected).
- PR into `dev`; dev→main promotion publishes.

## Follow-ups

- Once 0.0.22 is on npm and consumers migrate to `gha.*`, a future minor removes the `_$gha_*` aliases.
- The deferred tracker workflow re-wire ("PR B") can then import `gha.ci.*` on `@latest`.
