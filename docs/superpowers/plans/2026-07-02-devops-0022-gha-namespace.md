# @kbve/devops v0.0.22 — `gha` grouped namespace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `_$gha_*` GitHub-helper exports with one clean `gha` grouped namespace, additively (all `_$gha_*` aliases and top-level `ci` keep working), and ship as v0.0.22.

**Architecture:** Per module, rename each `_$gha_`-prefixed function to a clean name (updating in-file references), export a module group object, and keep every `_$gha_*` name as a `@deprecated` `export const` alias to the renamed function — the exact pattern `ci-failure.ts` already uses. A new `gha.ts` aggregates the group objects (plus `ci` and `withGitHubRetry`) into one `gha` object exported from the package root.

**Tech Stack:** TypeScript, Vitest (globals, node env), Nx.

## Global Constraints

- Additive, non-breaking: NO function signature or behavior changes. Every `_$gha_*` export name must still resolve after the rename (as a `@deprecated` alias). Top-level `ci` export stays exactly as-is.
- Member names strip the module prefix (e.g. `gha.issues.createComment`, not `createIssueComment`).
- Files use TAB indentation (repo prettier `useTabs:true`) — match each file. `sanitization.ts` is 2-space but is untouched here.
- No comments in code bodies. Terse `@deprecated` JSDoc on each alias only (one line), matching the existing `ci-failure.ts` aliases.
- Test runner: `pnpm nx test devops` (focused: append `-- <spec path>`). Run from repo root of the worktree.
- Do NOT hand-edit `version.toml` (CI marker). Version source is the MDX frontmatter.
- Full suite must stay green after every task (baseline: run `pnpm nx test devops` once at start to capture the number).

## Reference: the established pattern (already in `ci-failure.ts`)

```ts
function parseFailureLog(...) { ... }              // plain internal name
export const ci = { parseFailureLog, ... };        // group object
/** @deprecated Use `ci.parseFailureLog`. */
export const _$gha_parseFailureLog = parseFailureLog;   // deprecated alias
```

Each module below follows this shape. "Rename" means: change the `export function _$gha_X` / `export async function _$gha_X` definition to a non-exported `function X` / `async function X`, update any in-file callers of `_$gha_X` to `X`, then re-expose `X` via the group object and the `_$gha_X` alias.

---

### Task 1: `issues.ts` → `gha.issues` group

**Files:**

- Modify: `packages/npm/devops/src/lib/client/github/issues.ts`
- Test: `packages/npm/devops/src/lib/client/github/issues.spec.ts`

**Interfaces:**

- Consumes: `GitHubClient`, `GitHubContext`, `_$gha_extractIssueContext` (imported from `./types` — leave that import name as-is for this task; Task 4 renames it and keeps the alias, so it stays valid).
- Produces: `export const issues = { createComment, addReaction, removeLabel, addLabel, verifyMatrixLabel, addAssignees, removeAssignees, closeIssue, reopenIssue, lockIssue, unlockIssue }`, plus all 11 `_$gha_*` names as `@deprecated` aliases.

Rename map (definition + in-file references):
| current export | new name |
|---|---|
| `_$gha_createIssueComment` | `createComment` |
| `_$gha_addReaction` | `addReaction` |
| `_$gha_removeLabel` | `removeLabel` |
| `_$gha_addLabel` | `addLabel` |
| `_$gha_verifyMatrixLabel` | `verifyMatrixLabel` |
| `_$gha_addAssignees` | `addAssignees` |
| `_$gha_removeAssignees` | `removeAssignees` |
| `_$gha_closeIssue` | `closeIssue` |
| `_$gha_reopenIssue` | `reopenIssue` |
| `_$gha_lockIssue` | `lockIssue` |
| `_$gha_unlockIssue` | `unlockIssue` |

Note: `verifyMatrixLabel` calls `addLabel` and `removeLabel` internally — update those two call sites to the new names.

- [ ] **Step 1: Write the failing test**

Append to `issues.spec.ts` (add the imports it needs to the existing import block: `issues` and the `_$gha_*` names referenced):

```ts
describe('gha.issues group (v0.0.22)', () => {
	it('group members are the same references as their _$gha_ aliases', () => {
		expect(issues.createComment).toBe(_$gha_createIssueComment);
		expect(issues.verifyMatrixLabel).toBe(_$gha_verifyMatrixLabel);
		expect(issues.unlockIssue).toBe(_$gha_unlockIssue);
	});
	it('exposes all 11 members as functions', () => {
		const names = [
			'createComment',
			'addReaction',
			'removeLabel',
			'addLabel',
			'verifyMatrixLabel',
			'addAssignees',
			'removeAssignees',
			'closeIssue',
			'reopenIssue',
			'lockIssue',
			'unlockIssue',
		];
		for (const n of names)
			expect(typeof (issues as Record<string, unknown>)[n]).toBe(
				'function',
			);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test devops -- src/lib/client/github/issues.spec.ts`
Expected: FAIL — `issues` is not exported.

- [ ] **Step 3: Rename + add group + aliases**

For each row in the rename map: change `export async function _$gha_X(` to `async function newName(` (drop `export`), and update in-file references. Then at the end of the file add the group object and the alias block:

```ts
export const issues = {
	createComment,
	addReaction,
	removeLabel,
	addLabel,
	verifyMatrixLabel,
	addAssignees,
	removeAssignees,
	closeIssue,
	reopenIssue,
	lockIssue,
	unlockIssue,
};

/** @deprecated Use `gha.issues.createComment`. */
export const _$gha_createIssueComment = createComment;
/** @deprecated Use `gha.issues.addReaction`. */
export const _$gha_addReaction = addReaction;
/** @deprecated Use `gha.issues.removeLabel`. */
export const _$gha_removeLabel = removeLabel;
/** @deprecated Use `gha.issues.addLabel`. */
export const _$gha_addLabel = addLabel;
/** @deprecated Use `gha.issues.verifyMatrixLabel`. */
export const _$gha_verifyMatrixLabel = verifyMatrixLabel;
/** @deprecated Use `gha.issues.addAssignees`. */
export const _$gha_addAssignees = addAssignees;
/** @deprecated Use `gha.issues.removeAssignees`. */
export const _$gha_removeAssignees = removeAssignees;
/** @deprecated Use `gha.issues.closeIssue`. */
export const _$gha_closeIssue = closeIssue;
/** @deprecated Use `gha.issues.reopenIssue`. */
export const _$gha_reopenIssue = reopenIssue;
/** @deprecated Use `gha.issues.lockIssue`. */
export const _$gha_lockIssue = lockIssue;
/** @deprecated Use `gha.issues.unlockIssue`. */
export const _$gha_unlockIssue = unlockIssue;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test devops -- src/lib/client/github/issues.spec.ts`
Expected: PASS. Existing issues tests still green (they reference `_$gha_*` names, which still resolve).

- [ ] **Step 5: Commit**

```bash
git add packages/npm/devops/src/lib/client/github/issues.ts packages/npm/devops/src/lib/client/github/issues.spec.ts
git commit -m "refactor(devops): issues.ts → gha.issues group, keep _\$gha_ aliases"
```

---

### Task 2: `pulls.ts` → `gha.pulls` group

**Files:**

- Modify: `packages/npm/devops/src/lib/client/github/pulls.ts`
- Test: `packages/npm/devops/src/lib/client/github/pulls.spec.ts`

**Interfaces:**

- Produces: `export const pulls = { formatCommits, categorizeApiCommits, generatePRTitle, formatDevBody, getPullRequestNumber, updatePullRequestBody, fetchAndCleanCommits, processAndUpdatePR, createOrUpdatePR }` plus all 9 `_$gha_*` aliases.

Rename map:
| current export | new name |
|---|---|
| `_$gha_formatCommits` | `formatCommits` |
| `_$gha_categorizeApiCommits` | `categorizeApiCommits` |
| `_$gha_generatePRTitle` | `generatePRTitle` |
| `_$gha_formatDevBody` | `formatDevBody` |
| `_$gha_getPullRequestNumber` | `getPullRequestNumber` |
| `_$gha_updatePullRequestBody` | `updatePullRequestBody` |
| `_$gha_fetchAndCleanCommits` | `fetchAndCleanCommits` |
| `_$gha_processAndUpdatePR` | `processAndUpdatePR` |
| `_$gha_createOrUpdatePR` | `createOrUpdatePR` |

Note: several of these call each other in-file (e.g. `processAndUpdatePR`/`createOrUpdatePR` call the formatting + fetch helpers). After renaming the definitions, update ALL in-file references from `_$gha_X` to `X`. Grep the file for `_$gha_` after editing — the only remaining occurrences should be the `export const _$gha_X = X;` alias lines at the bottom.

- [ ] **Step 1: Write the failing test**

Append to `pulls.spec.ts` (extend the import block with `pulls` and the `_$gha_*` names referenced):

```ts
describe('gha.pulls group (v0.0.22)', () => {
	it('group members match their _$gha_ aliases', () => {
		expect(pulls.formatCommits).toBe(_$gha_formatCommits);
		expect(pulls.createOrUpdatePR).toBe(_$gha_createOrUpdatePR);
		expect(pulls.generatePRTitle).toBe(_$gha_generatePRTitle);
	});
	it('exposes all 9 members as functions', () => {
		const names = [
			'formatCommits',
			'categorizeApiCommits',
			'generatePRTitle',
			'formatDevBody',
			'getPullRequestNumber',
			'updatePullRequestBody',
			'fetchAndCleanCommits',
			'processAndUpdatePR',
			'createOrUpdatePR',
		];
		for (const n of names)
			expect(typeof (pulls as Record<string, unknown>)[n]).toBe(
				'function',
			);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test devops -- src/lib/client/github/pulls.spec.ts`
Expected: FAIL — `pulls` not exported.

- [ ] **Step 3: Rename + add group + aliases**

Rename each definition per the map, update all in-file cross-references, then append:

```ts
export const pulls = {
	formatCommits,
	categorizeApiCommits,
	generatePRTitle,
	formatDevBody,
	getPullRequestNumber,
	updatePullRequestBody,
	fetchAndCleanCommits,
	processAndUpdatePR,
	createOrUpdatePR,
};

/** @deprecated Use `gha.pulls.formatCommits`. */
export const _$gha_formatCommits = formatCommits;
/** @deprecated Use `gha.pulls.categorizeApiCommits`. */
export const _$gha_categorizeApiCommits = categorizeApiCommits;
/** @deprecated Use `gha.pulls.generatePRTitle`. */
export const _$gha_generatePRTitle = generatePRTitle;
/** @deprecated Use `gha.pulls.formatDevBody`. */
export const _$gha_formatDevBody = formatDevBody;
/** @deprecated Use `gha.pulls.getPullRequestNumber`. */
export const _$gha_getPullRequestNumber = getPullRequestNumber;
/** @deprecated Use `gha.pulls.updatePullRequestBody`. */
export const _$gha_updatePullRequestBody = updatePullRequestBody;
/** @deprecated Use `gha.pulls.fetchAndCleanCommits`. */
export const _$gha_fetchAndCleanCommits = fetchAndCleanCommits;
/** @deprecated Use `gha.pulls.processAndUpdatePR`. */
export const _$gha_processAndUpdatePR = processAndUpdatePR;
/** @deprecated Use `gha.pulls.createOrUpdatePR`. */
export const _$gha_createOrUpdatePR = createOrUpdatePR;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test devops -- src/lib/client/github/pulls.spec.ts`
Expected: PASS. Existing pulls tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/devops/src/lib/client/github/pulls.ts packages/npm/devops/src/lib/client/github/pulls.spec.ts
git commit -m "refactor(devops): pulls.ts → gha.pulls group, keep _\$gha_ aliases"
```

---

### Task 3: `actions.ts` → `gha.actions` group

**Files:**

- Modify: `packages/npm/devops/src/lib/client/github/actions.ts`
- Test: `packages/npm/devops/src/lib/client/github/actions.spec.ts`

**Interfaces:**

- Produces: `export const actions = { findActionInTitle, kbveActionProcess, findActionInTitleSafe }` plus the 2 `_$gha_*` aliases. `findActionInTitleSafe` already exists as a plain export (v0.0.21) — leave it exported and include it in the group.

Rename map:
| current export | new name |
|---|---|
| `_$gha_findActionInTitle` | `findActionInTitle` |
| `_$gha_kbve_ActionProcess` | `kbveActionProcess` |

Note: `_$gha_kbve_ActionProcess` calls `_$gha_findActionInTitle` in-file — update that call to `findActionInTitle`.

- [ ] **Step 1: Write the failing test**

Append to `actions.spec.ts` (extend the top import block with `actions`, `_$gha_findActionInTitle`, `_$gha_kbve_ActionProcess`):

```ts
describe('gha.actions group (v0.0.22)', () => {
	it('group members match their _$gha_ aliases', () => {
		expect(actions.findActionInTitle).toBe(_$gha_findActionInTitle);
		expect(actions.kbveActionProcess).toBe(_$gha_kbve_ActionProcess);
	});
	it('includes findActionInTitleSafe', () => {
		expect(typeof actions.findActionInTitleSafe).toBe('function');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test devops -- src/lib/client/github/actions.spec.ts`
Expected: FAIL — `actions` not exported.

- [ ] **Step 3: Rename + add group + aliases**

Rename the 2 definitions (drop `export`, update the in-file call), keep `findActionInTitleSafe` as-is, then append:

```ts
export const actions = {
	findActionInTitle,
	kbveActionProcess,
	findActionInTitleSafe,
};

/** @deprecated Use `gha.actions.findActionInTitle`. */
export const _$gha_findActionInTitle = findActionInTitle;
/** @deprecated Use `gha.actions.kbveActionProcess`. */
export const _$gha_kbve_ActionProcess = kbveActionProcess;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test devops -- src/lib/client/github/actions.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/devops/src/lib/client/github/actions.ts packages/npm/devops/src/lib/client/github/actions.spec.ts
git commit -m "refactor(devops): actions.ts → gha.actions group, keep _\$gha_ aliases"
```

---

### Task 4: `docker.ts` → `gha.docker` + `types.ts` → `gha.context`

**Files:**

- Modify: `packages/npm/devops/src/lib/client/github/docker.ts`
- Modify: `packages/npm/devops/src/lib/client/github/types.ts`
- Test (create): `packages/npm/devops/src/lib/client/github/docker.spec.ts` (if one exists, append instead)
- Test (create): `packages/npm/devops/src/lib/client/github/types.spec.ts`

**Interfaces:**

- Produces: `export const docker = { runContainer, stopContainer }` (+ 2 aliases); `export const context = { extractIssue, extractRepo }` (+ 2 aliases).
- Consumes note: `issues.ts` imports `_$gha_extractIssueContext` from `./types`; that alias is preserved, so no cross-file break.

docker.ts rename map:
| current export | new name |
|---|---|
| `_$gha_runDockerContainer` | `runContainer` |
| `_$gha_stopDockerContainer` | `stopContainer` |

types.ts rename map:
| current export | new name |
|---|---|
| `_$gha_extractIssueContext` | `extractIssue` |
| `_$gha_extractRepoContext` | `extractRepo` |

Note: `types.ts` also holds interfaces/types — leave all of those exactly as-is. Only the two functions are touched.

- [ ] **Step 1: Write the failing tests**

Create `docker.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
	docker,
	_$gha_runDockerContainer,
	_$gha_stopDockerContainer,
} from './docker';

describe('gha.docker group (v0.0.22)', () => {
	it('members match aliases', () => {
		expect(docker.runContainer).toBe(_$gha_runDockerContainer);
		expect(docker.stopContainer).toBe(_$gha_stopDockerContainer);
	});
});
```

Create `types.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
	context,
	_$gha_extractIssueContext,
	_$gha_extractRepoContext,
} from './types';

describe('gha.context group (v0.0.22)', () => {
	it('members match aliases', () => {
		expect(context.extractIssue).toBe(_$gha_extractIssueContext);
		expect(context.extractRepo).toBe(_$gha_extractRepoContext);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test devops -- src/lib/client/github/docker.spec.ts src/lib/client/github/types.spec.ts`
Expected: FAIL — `docker` / `context` not exported.

- [ ] **Step 3: Rename + add groups + aliases**

In `docker.ts`, rename both functions (drop `export`), then append:

```ts
export const docker = {
	runContainer,
	stopContainer,
};

/** @deprecated Use `gha.docker.runContainer`. */
export const _$gha_runDockerContainer = runContainer;
/** @deprecated Use `gha.docker.stopContainer`. */
export const _$gha_stopDockerContainer = stopContainer;
```

In `types.ts`, rename the two functions (drop `export`), then append (leave all type/interface exports untouched):

```ts
export const context = {
	extractIssue,
	extractRepo,
};

/** @deprecated Use `gha.context.extractIssue`. */
export const _$gha_extractIssueContext = extractIssue;
/** @deprecated Use `gha.context.extractRepo`. */
export const _$gha_extractRepoContext = extractRepo;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test devops -- src/lib/client/github/docker.spec.ts src/lib/client/github/types.spec.ts`
Expected: PASS. Also run the issues/pulls specs to confirm the preserved `_$gha_extractIssueContext` import still resolves:
Run: `pnpm nx test devops -- src/lib/client/github/issues.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/devops/src/lib/client/github/docker.ts packages/npm/devops/src/lib/client/github/docker.spec.ts packages/npm/devops/src/lib/client/github/types.ts packages/npm/devops/src/lib/client/github/types.spec.ts
git commit -m "refactor(devops): docker.ts + types.ts → gha.docker/gha.context, keep _\$gha_ aliases"
```

---

### Task 5: `gha` aggregator + entrypoint wiring + smoke tests

**Files:**

- Create: `packages/npm/devops/src/lib/client/github/gha.ts`
- Create: `packages/npm/devops/src/lib/client/github/gha.spec.ts`
- Modify: `packages/npm/devops/src/index.ts`
- Modify: `packages/npm/devops/src/index.spec.ts`

**Interfaces:**

- Consumes: `ci` (from `./ci-failure`), `issues` (Task 1), `pulls` (Task 2), `actions` (Task 3), `docker` + `context` (Task 4), `withGitHubRetry` (from `./retry`).
- Produces: `export const gha = { ci, issues, actions, pulls, docker, context, withRetry }` where `withRetry === withGitHubRetry`; re-exported from the package root as `gha`.

- [ ] **Step 1: Write the failing tests**

Create `gha.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gha } from './gha';
import { ci } from './ci-failure';

describe('gha aggregator (v0.0.22)', () => {
	it('groups every domain', () => {
		for (const g of [
			'ci',
			'issues',
			'actions',
			'pulls',
			'docker',
			'context',
		]) {
			expect(typeof (gha as Record<string, unknown>)[g]).toBe('object');
		}
		expect(typeof gha.withRetry).toBe('function');
	});
	it('gha.ci is the same object as the top-level ci', () => {
		expect(gha.ci).toBe(ci);
	});
	it('representative members are functions', () => {
		expect(typeof gha.issues.createComment).toBe('function');
		expect(typeof gha.pulls.createOrUpdatePR).toBe('function');
		expect(typeof gha.actions.findActionInTitle).toBe('function');
		expect(typeof gha.docker.runContainer).toBe('function');
		expect(typeof gha.context.extractIssue).toBe('function');
		expect(typeof gha.ci.parseFailureLog).toBe('function');
	});
});
```

Append to `index.spec.ts` (inside a new describe; the file already imports `* as devops from './index'`):

```ts
describe('gha entrypoint export (v0.0.22)', () => {
	it('exposes gha with all groups from the package root', () => {
		expect(typeof devops.gha).toBe('object');
		expect(typeof devops.gha.issues.createComment).toBe('function');
		expect(typeof devops.gha.pulls.createOrUpdatePR).toBe('function');
		expect(typeof devops.gha.docker.runContainer).toBe('function');
		expect(typeof devops.gha.context.extractIssue).toBe('function');
		expect(typeof devops.gha.withRetry).toBe('function');
	});
	it('keeps top-level ci working and equal to gha.ci', () => {
		expect(devops.gha.ci).toBe(devops.ci);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test devops -- src/lib/client/github/gha.spec.ts src/index.spec.ts`
Expected: FAIL — `./gha` does not exist; `devops.gha` undefined.

- [ ] **Step 3: Create the aggregator + wire the entrypoint**

Create `gha.ts`:

```ts
import { ci } from './ci-failure';
import { issues } from './issues';
import { actions } from './actions';
import { pulls } from './pulls';
import { docker } from './docker';
import { context } from './types';
import { withGitHubRetry } from './retry';

export const gha = {
	ci,
	issues,
	actions,
	pulls,
	docker,
	context,
	withRetry: withGitHubRetry,
};
```

In `src/index.ts`, add after the existing `export * from './lib/client/github/retry';` line:

```ts
export { gha } from './lib/client/github/gha';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test devops -- src/lib/client/github/gha.spec.ts src/index.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/devops/src/lib/client/github/gha.ts packages/npm/devops/src/lib/client/github/gha.spec.ts packages/npm/devops/src/index.ts packages/npm/devops/src/index.spec.ts
git commit -m "feat(devops): gha aggregator namespace wired into entrypoint"
```

---

### Task 6: full suite + build green, version bump, manifest regen

**Files:**

- Modify: `apps/kbve/astro-kbve/src/content/docs/project/devops.mdx:14`
- Modify: `.github/ci-dispatch-manifest.json` (generated)

- [ ] **Step 1: Run the full suite**

Run: `pnpm nx test devops`
Expected: PASS — all pre-existing tests plus the new group/aggregator tests green.

- [ ] **Step 2: Verify the build compiles (proves `gha` resolves from the root)**

Run: `pnpm nx build devops`
Expected: build succeeds; `dist/packages/npm/devops` emitted.

- [ ] **Step 3: Confirm no stray `_$gha_` references remain outside alias lines**

Run: `grep -rn '_\$gha_' packages/npm/devops/src --include='*.ts' | grep -v spec | grep -v 'export const _\$gha_'`
Expected: NO output (every non-spec `_$gha_` occurrence is now an `export const _$gha_X = X;` alias line). If any in-file call site was missed, it appears here — fix it and re-run the module's tests.

- [ ] **Step 4: Bump the version source**

Edit `apps/kbve/astro-kbve/src/content/docs/project/devops.mdx` line 14:

```
version: "0.0.22"
```

(Leave `version.toml` untouched.)

- [ ] **Step 5: Regenerate the dispatch manifest**

Run: `pnpm nx run astro-kbve:gen:ci-manifest --skip-nx-cache`
Verify: `git diff .github/ci-dispatch-manifest.json` shows only the devops `version` field changing (0.0.21 → 0.0.22).

- [ ] **Step 6: Commit**

```bash
git add apps/kbve/astro-kbve/src/content/docs/project/devops.mdx .github/ci-dispatch-manifest.json
git commit -m "release(devops): bump to 0.0.22 + regen ci-dispatch-manifest"
```

---

## Self-Review

**Spec coverage:**

- `gha.issues` → Task 1 ✓ | `gha.pulls` → Task 2 ✓ | `gha.actions` → Task 3 ✓ | `gha.docker` + `gha.context` → Task 4 ✓ | `gha` aggregator + entrypoint + `ci` reuse → Task 5 ✓ | release (MDX bump, manifest regen, version.toml untouched) → Task 6 ✓
- All 33 `_$gha_*` names preserved as `@deprecated` aliases across Tasks 1–4 (11+9+2+2+2 renamed here; ci-failure's 7 already aliased in v0.0.21 and reused via `gha.ci`).
- Non-breaking guard: Task 6 Step 3 grep proves no missed in-file call site; top-level `ci` untouched.

**Placeholder scan:** none — every step carries the exact rename map, group object, alias block, and test code.

**Type consistency:** group object names (`issues`, `pulls`, `actions`, `docker`, `context`) and member names match between each module task, the `gha.ts` aggregator (Task 5), and the tests. `withRetry` maps to `withGitHubRetry`. `gha.ci === ci` asserted in Task 5.
