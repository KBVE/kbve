# @kbve/devops v0.0.21 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden `@kbve/devops` against oversized logs, malformed registry entries, GitHub rate-limits, and null inputs — additively, breaking no existing signature — and ship it as v0.0.21.

**Architecture:** Every current export and `_$gha_*` behavior is preserved. New robustness arrives via optional parameters with sane defaults and new safe-variant functions. Test-first: each behavior gets a vitest case in the module's existing `*.spec.ts`.

**Tech Stack:** TypeScript, Vitest (globals, node env), Nx, Zod, jsdom + DOMPurify + marked.

## Global Constraints

- Compat: additive, non-breaking. Do NOT change any existing function signature, return type, or throw/no-throw behavior. New params are optional with defaults preserving current output.
- No new `_$gha_*`-prefixed exports. New functions use plain names (namespace membership added in v0.0.22).
- Indentation: tabs in `ci-failure.ts`, `manifest.ts`, `actions.ts`, `issues.ts`, `github/index.ts`; two-spaces in `sanitization.ts`. Match the file you edit.
- No comments in code bodies (user preference). Terse doc-comments only where the file already uses them.
- Test runner: `pnpm nx test devops` (or `./kbve.sh -nx "test devops"`). Run from repo root.
- Do NOT hand-edit `version.toml` — it is a CI post-publish marker. Version source of truth is the MDX frontmatter.
- Full suite (currently 236 tests) must stay green after every task.

---

### Task 1: sanitization null-guards + integer port

**Files:**
- Modify: `packages/npm/devops/src/lib/sanitization.ts`
- Test: `packages/npm/devops/src/lib/sanitization.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `_title`, `_md_safe_row`, `stripNonAlphanumeric`, `markdownToJsonSafeString` now return safe-empty on non-string input instead of throwing; `sanitizePort` rejects non-integers. Signatures unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `sanitization.spec.ts`:

```ts
describe('sanitization hardening (v0.0.21)', () => {
  it('_title returns empty string on non-string input', () => {
    expect(_title(undefined as unknown as string)).toBe('');
    expect(_title(null as unknown as string)).toBe('');
  });

  it('_md_safe_row returns empty string on non-string input', () => {
    expect(_md_safe_row(undefined as unknown as string)).toBe('');
  });

  it('stripNonAlphanumeric returns empty string on non-string input', () => {
    expect(stripNonAlphanumeric(null as unknown as string)).toBe('');
  });

  it('markdownToJsonSafeString returns JSON empty string on non-string input', async () => {
    await expect(
      markdownToJsonSafeString(undefined as unknown as string),
    ).resolves.toBe('""');
  });

  it('sanitizePort rejects non-integer ports', () => {
    expect(() => sanitizePort(80.5)).toThrow(
      'Invalid port number. Port must be a number between 1 and 65535.',
    );
  });

  it('sanitizePort still accepts a valid integer port', () => {
    expect(sanitizePort(8080)).toBe(8080);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test devops -- src/lib/sanitization.spec.ts`
Expected: FAIL — `_title(undefined)` throws `Cannot read properties of undefined (reading 'slice')`; `sanitizePort(80.5)` returns `80.5` instead of throwing.

- [ ] **Step 3: Add the guards**

In `sanitization.ts`, edit `_title` (add first line):

```ts
export function _title(title: string): string {
  if (typeof title !== 'string') return '';
  const truncatedTitle = title.slice(0, 64);
```

Edit `_md_safe_row` (add first line):

```ts
export function _md_safe_row(row: string): string {
  if (typeof row !== 'string') return '';
  const mdSafeRow = row
```

Edit `stripNonAlphanumeric` (add first line):

```ts
export function stripNonAlphanumeric(text: string): string {
  if (typeof text !== 'string') return '';
  return text.replace(/[^a-zA-Z0-9 .]/g, '');
}
```

Edit `markdownToJsonSafeString` — add the guard and collapse to a single JSDOM window:

```ts
export async function markdownToJsonSafeString(markdownContent: string): Promise<string> {
  if (typeof markdownContent !== 'string') return '""';
  const htmlContent = await marked.parse(markdownContent);
  const window = new JSDOM('').window;
  const DOMPurifyInstance = DOMPurify(window);
  const sanitizedHtmlContent = DOMPurifyInstance.sanitize(htmlContent);
  window.document.body.innerHTML = sanitizedHtmlContent;
  const textContent = (window.document.body.textContent || '').trim();
  return JSON.stringify(textContent);
}
```

Edit `sanitizePort` — replace the `isNaN` guard:

```ts
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid port number. Port must be a number between 1 and 65535.');
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test devops -- src/lib/sanitization.spec.ts`
Expected: PASS, and all pre-existing sanitization tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/devops/src/lib/sanitization.ts packages/npm/devops/src/lib/sanitization.spec.ts
git commit -m "fix(devops): null-guard sanitizers + integer-only sanitizePort"
```

---

### Task 2: ci-failure — snippet cap + named window constants

**Files:**
- Modify: `packages/npm/devops/src/lib/client/github/ci-failure.ts`
- Test: `packages/npm/devops/src/lib/client/github/ci-failure.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseFailureLog(rawLog: string, opts?: ParseFailureLogOptions)` where `ParseFailureLogOptions = { maxSnippetChars?: number; contextBefore?: number; contextAfter?: number }`. Default `maxSnippetChars` = 12000. Single-arg calls unchanged. `ci.parseFailureLog` proxies the same fn.

- [ ] **Step 1: Write the failing test**

Append to `ci-failure.spec.ts`:

```ts
describe('parseFailureLog snippet cap (v0.0.21)', () => {
  it('clamps an oversized snippet and inserts a snip marker', () => {
    const huge = Array.from({ length: 5000 }, (_, i) => `error line ${i}`).join('\n');
    const { snippet } = ci.parseFailureLog(huge, { maxSnippetChars: 500 });
    expect(snippet.length).toBeLessThanOrEqual(600);
    expect(snippet).toContain('[snipped');
  });

  it('leaves a small snippet untouched (no marker)', () => {
    const { snippet } = ci.parseFailureLog('error: boom\ndetail line');
    expect(snippet).not.toContain('[snipped');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test devops -- src/lib/client/github/ci-failure.spec.ts`
Expected: FAIL — snippet length far exceeds 600, no `[snipped` marker.

- [ ] **Step 3: Implement the cap**

In `ci-failure.ts`, add constants + option type above `parseFailureLog`:

```ts
const DEFAULT_CONTEXT_BEFORE = 30;
const DEFAULT_CONTEXT_AFTER = 4;
const DEFAULT_MAX_SNIPPET_CHARS = 12000;
const NX_TARGET_SCAN_LINES = 20;

export interface ParseFailureLogOptions {
	maxSnippetChars?: number;
	contextBefore?: number;
	contextAfter?: number;
}

function clampSnippet(snippet: string, max: number): string {
	if (snippet.length <= max) {
		return snippet;
	}
	const head = Math.floor(max / 2);
	const tail = max - head;
	const removed = snippet.length - max;
	return (
		snippet.slice(0, head) +
		`\n… [snipped ${removed} chars] …\n` +
		snippet.slice(snippet.length - tail)
	);
}
```

Replace `extractNxTargets`'s literal `idx + 21` with the named constant:

```ts
	for (let i = idx + 1; i < Math.min(lines.length, idx + 1 + NX_TARGET_SCAN_LINES); i++) {
```

Replace `parseFailureLog` body to use options + clamp:

```ts
function parseFailureLog(
	rawLog: string,
	opts: ParseFailureLogOptions = {},
): ParsedFailureLog {
	const maxSnippetChars = opts.maxSnippetChars ?? DEFAULT_MAX_SNIPPET_CHARS;
	const contextBefore = opts.contextBefore ?? DEFAULT_CONTEXT_BEFORE;
	const contextAfter = opts.contextAfter ?? DEFAULT_CONTEXT_AFTER;

	if (!rawLog) {
		return { snippet: '', nxTargets: '' };
	}

	const clean = rawLog
		.split('\n')
		.map((line) => line.replace(ANSI, '').replace(GH_TIMESTAMP, ''))
		.filter(
			(line) => !NOISE_PREFIXES.test(line) && !GROUP_MARKER.test(line),
		);

	let lastErr = -1;
	for (let i = 0; i < clean.length; i++) {
		if (ERROR_MARKER.test(clean[i])) {
			lastErr = i;
		}
	}

	let snippet: string;
	if (lastErr >= 0) {
		const start = Math.max(0, lastErr - contextBefore);
		const end = Math.min(clean.length, lastErr + contextAfter);
		snippet = clean.slice(start, end).join('\n');
	} else {
		snippet = clean.slice(Math.max(0, clean.length - contextBefore)).join('\n');
	}

	snippet = clampSnippet(snippet, maxSnippetChars);

	return { snippet, nxTargets: extractNxTargets(clean) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test devops -- src/lib/client/github/ci-failure.spec.ts`
Expected: PASS, existing ci-failure tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/devops/src/lib/client/github/ci-failure.ts packages/npm/devops/src/lib/client/github/ci-failure.spec.ts
git commit -m "fix(devops): cap parseFailureLog snippet, name window constants"
```

---

### Task 3: ci-failure — bounded failure-history table

**Files:**
- Modify: `packages/npm/devops/src/lib/client/github/ci-failure.ts`
- Test: `packages/npm/devops/src/lib/client/github/ci-failure.spec.ts`

**Interfaces:**
- Consumes: `incrementHistory(oldBody, entry)` (existing).
- Produces: `incrementHistory(oldBody: string, entry: HistoryEntry, opts?: IncrementHistoryOptions)` where `IncrementHistoryOptions = { maxRows?: number }`, default 20. Two-arg calls unchanged. Oldest data rows are dropped once the table exceeds `maxRows`; the `Consecutive failures` counter keeps climbing.

- [ ] **Step 1: Write the failing test**

Append to `ci-failure.spec.ts`:

```ts
describe('incrementHistory row cap (v0.0.21)', () => {
  function seedBody(rows: number): string {
    const meta = {
      title: 't', workflowName: 'wf', jobName: 'job', failedStep: 'step',
      runId: '1', runUrl: 'u', ref: 'r', eventName: 'push', timestamp: 'T',
      logSnippet: 'x',
    };
    let body = ci.buildIssueBody(meta);
    for (let i = 2; i <= rows; i++) {
      body = ci.incrementHistory(body, {
        runId: String(i), runUrl: 'u', ref: 'r', eventName: 'push', timestamp: `T${i}`,
      });
    }
    return body;
  }

  it('keeps at most maxRows data rows but still increments the counter', () => {
    const body = seedBody(25);
    const capped = ci.incrementHistory(
      body,
      { runId: '26', runUrl: 'u', ref: 'r', eventName: 'push', timestamp: 'T26' },
      { maxRows: 5 },
    );
    const dataRows = capped.split('\n').filter((l) => /^\|\s*\d+\s*\|/.test(l));
    expect(dataRows.length).toBe(5);
    expect(capped).toContain('**Consecutive failures:** 26');
    expect(capped).toContain('| 26 |');
    expect(capped).not.toContain('| 1 |');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test devops -- src/lib/client/github/ci-failure.spec.ts`
Expected: FAIL — `dataRows.length` is 26, not 5 (no cap applied).

- [ ] **Step 3: Implement the cap**

In `ci-failure.ts`, add option type + default above `incrementHistory`:

```ts
const DEFAULT_MAX_HISTORY_ROWS = 20;

export interface IncrementHistoryOptions {
	maxRows?: number;
}
```

Replace `incrementHistory` to trim after inserting:

```ts
function incrementHistory(
	oldBody: string,
	entry: HistoryEntry,
	opts: IncrementHistoryOptions = {},
): string {
	const maxRows = opts.maxRows ?? DEFAULT_MAX_HISTORY_ROWS;
	const countRe = /(\*\*Consecutive failures:\*\* )(\d+)/;
	const match = oldBody.match(countRe);
	const count = match ? parseInt(match[2], 10) + 1 : 1;

	let body = match ? oldBody.replace(countRe, `$1${count}`) : oldBody;

	const row = `| ${count} | ${entry.timestamp} | [#${entry.runId}](${entry.runUrl}) | ${entry.ref} | ${entry.eventName} |`;

	const lines = body.split('\n');
	let lastRow = -1;
	for (let i = 0; i < lines.length; i++) {
		if (/^\|\s*\d+\s*\|/.test(lines[i])) {
			lastRow = i;
		}
	}
	if (lastRow >= 0) {
		lines.splice(lastRow + 1, 0, row);
	}

	const dataRowIdx: number[] = [];
	for (let i = 0; i < lines.length; i++) {
		if (/^\|\s*\d+\s*\|/.test(lines[i])) {
			dataRowIdx.push(i);
		}
	}
	if (dataRowIdx.length > maxRows) {
		const drop = new Set(dataRowIdx.slice(0, dataRowIdx.length - maxRows));
		return lines.filter((_, i) => !drop.has(i)).join('\n');
	}

	return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test devops -- src/lib/client/github/ci-failure.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/devops/src/lib/client/github/ci-failure.ts packages/npm/devops/src/lib/client/github/ci-failure.spec.ts
git commit -m "fix(devops): bound ci-failure history table rows"
```

---

### Task 4: ci-failure — classifyAll + expanded pattern set

**Files:**
- Modify: `packages/npm/devops/src/lib/client/github/ci-failure.ts`
- Test: `packages/npm/devops/src/lib/client/github/ci-failure.spec.ts`

**Interfaces:**
- Consumes: `CI_FAILURE_PATTERNS`, `classifyFailure` (existing).
- Produces: `classifyAll(log: string): string[]` returning every matching pattern reason; exposed as `ci.classifyAll`. `CI_FAILURE_PATTERNS` gains 5 entries (network/DNS, lockfile, disk-full, LFS smudge 404, git auth). `classifyFailure` behavior (first match) unchanged.

- [ ] **Step 1: Write the failing test**

Append to `ci-failure.spec.ts`:

```ts
describe('classifyAll + new patterns (v0.0.21)', () => {
  it('returns all matching reasons for a multi-cause log', () => {
    const log = 'getaddrinfo ENOTFOUND registry.npmjs.org\nENOSPC no space left on device';
    const reasons = ci.classifyAll(log);
    expect(reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('classifies an LFS smudge 404', () => {
    expect(ci.classifyFailure('smudge filter lfs failed')).not.toBeNull();
  });

  it('classifies a frozen-lockfile mismatch', () => {
    expect(ci.classifyFailure('ERR_PNPM_OUTDATED_LOCKFILE frozen-lockfile')).not.toBeNull();
  });

  it('returns empty array when nothing matches', () => {
    expect(ci.classifyAll('everything is fine')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test devops -- src/lib/client/github/ci-failure.spec.ts`
Expected: FAIL — `ci.classifyAll` is undefined; LFS/lockfile logs classify to `null`.

- [ ] **Step 3: Add patterns + classifyAll**

In `ci-failure.ts`, append entries to `CI_FAILURE_PATTERNS` (after the timeout entry, before the closing `];`):

```ts
	{
		test: /ETIMEDOUT|ENOTFOUND|getaddrinfo|ECONNRESET|connection reset|network is unreachable/i,
		reason: '🌐 Network/DNS failure reaching a remote host — a registry or Git endpoint was unreachable. Usually transient; re-run, and check runner egress if it persists.',
	},
	{
		test: /ERR_PNPM_[A-Z_]*LOCKFILE|frozen-lockfile|lockfile.*(mismatch|outdated)|npm ci.*can only install/i,
		reason: '🔒 Lockfile out of sync — the frozen lockfile does not match package manifests. Run the package manager install locally, commit the updated lockfile.',
	},
	{
		test: /ENOSPC|no space left on device|disk quota exceeded/i,
		reason: '💾 Runner ran out of disk — no space left on device. Prune caches/artifacts or use a larger runner.',
	},
	{
		test: /smudge filter lfs failed|error downloading object.*\(404\)|batch response:.*404/i,
		reason: '📦 Git LFS smudge 404 — an LFS object could not be fetched. Set GIT_LFS_SKIP_SMUDGE=1 for the checkout or verify the object exists on the LFS server.',
	},
	{
		test: /fatal: could not read Username|Permission denied \(publickey\)|remote: (Invalid username or password|Unauthorized)/i,
		reason: '🔐 Git authentication failed — credentials for the remote were rejected. Rotate/verify the deploy token or SSH key.',
	},
```

Add `classifyAll` after `classifyFailure`:

```ts
function classifyAll(log: string): string[] {
	const reasons: string[] = [];
	for (const pattern of CI_FAILURE_PATTERNS) {
		if (pattern.test.test(log)) {
			reasons.push(pattern.reason);
		}
	}
	return reasons;
}
```

Add `classifyAll` to the `ci` namespace object:

```ts
export const ci = {
	failurePatterns: CI_FAILURE_PATTERNS,
	issueTitle,
	classifyFailure,
	classifyAll,
	parseFailureLog,
	buildIssueBody,
	buildComment,
	buildResolveComment,
	incrementHistory,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test devops -- src/lib/client/github/ci-failure.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/devops/src/lib/client/github/ci-failure.ts packages/npm/devops/src/lib/client/github/ci-failure.spec.ts
git commit -m "feat(devops): classifyAll + expand CI failure pattern set"
```

---

### Task 5: ci-failure — clamp assembled issue body to GitHub limit

**Files:**
- Modify: `packages/npm/devops/src/lib/client/github/ci-failure.ts`
- Test: `packages/npm/devops/src/lib/client/github/ci-failure.spec.ts`

**Interfaces:**
- Consumes: `buildIssueBody(meta: FailureIssueMeta)` (existing signature, unchanged).
- Produces: returned body is always ≤ 65536 chars; a truncation marker is appended when clamped.

- [ ] **Step 1: Write the failing test**

Append to `ci-failure.spec.ts`:

```ts
describe('buildIssueBody GitHub limit (v0.0.21)', () => {
  it('never returns a body over 65536 chars', () => {
    const body = ci.buildIssueBody({
      title: 't', workflowName: 'wf', jobName: 'job', failedStep: 'step',
      runId: '1', runUrl: 'u', ref: 'r', eventName: 'push', timestamp: 'T',
      logSnippet: 'x'.repeat(100000),
    });
    expect(body.length).toBeLessThanOrEqual(65536);
    expect(body).toContain('Body truncated');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test devops -- src/lib/client/github/ci-failure.spec.ts`
Expected: FAIL — body length ~100k.

- [ ] **Step 3: Add the clamp**

In `ci-failure.ts`, add a constant near the other constants:

```ts
const GITHUB_MAX_BODY = 65536;
```

At the end of `buildIssueBody`, replace `return lines.join('\n');` with:

```ts
	const body = lines.join('\n');
	if (body.length <= GITHUB_MAX_BODY) {
		return body;
	}
	const marker = '\n\n> ⚠️ Body truncated to fit the GitHub 65536-char limit.\n';
	return body.slice(0, GITHUB_MAX_BODY - marker.length) + marker;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test devops -- src/lib/client/github/ci-failure.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/devops/src/lib/client/github/ci-failure.ts packages/npm/devops/src/lib/client/github/ci-failure.spec.ts
git commit -m "fix(devops): clamp CI failure issue body to GitHub limit"
```

---

### Task 6: manifest — non-throwing safe builder

**Files:**
- Modify: `packages/npm/devops/src/lib/ci/manifest.ts`
- Test: create `packages/npm/devops/src/lib/ci/manifest.spec.ts`

**Interfaces:**
- Consumes: `mappers`, `DispatchManifest`, `CI_PROJECTS` (existing). `buildDispatchManifest()` unchanged (still throws in strict mode).
- Produces: `buildDispatchManifestSafe(): SafeManifestResult` where `SafeManifestResult = { manifest: DispatchManifest; errors: ManifestError[] }` and `ManifestError = { key: string; pipeline: string; message: string }`. Bad entries are collected and skipped; the partial manifest is still returned.

- [ ] **Step 1: Write the failing test**

Create `manifest.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDispatchManifest, buildDispatchManifestSafe } from './manifest';

describe('buildDispatchManifestSafe (v0.0.21)', () => {
  it('returns a manifest and an empty error list for the real registry', () => {
    const { manifest, errors } = buildDispatchManifestSafe();
    expect(errors).toEqual([]);
    expect(Array.isArray(manifest.npm)).toBe(true);
    expect(manifest.npm.length).toBeGreaterThan(0);
  });

  it('matches the strict builder output when the registry is valid', () => {
    const strict = buildDispatchManifest();
    const { manifest } = buildDispatchManifestSafe();
    expect(manifest).toEqual(strict);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test devops -- src/lib/ci/manifest.spec.ts`
Expected: FAIL — `buildDispatchManifestSafe` is not exported.

- [ ] **Step 3: Implement the safe builder**

In `manifest.ts`, add types + function at the end of the file:

```ts
export interface ManifestError {
	key: string;
	pipeline: string;
	message: string;
}

export interface SafeManifestResult {
	manifest: DispatchManifest;
	errors: ManifestError[];
}

export function buildDispatchManifestSafe(): SafeManifestResult {
	const manifest: DispatchManifest = {
		docker: [],
		npm: [],
		crates: [],
		python: [],
		unreal: [],
		ue5_server: [],
	};
	const errors: ManifestError[] = [];

	for (const project of CI_PROJECTS) {
		const mapper = mappers[project.pipeline];
		if (!mapper) {
			errors.push({
				key: project.key,
				pipeline: project.pipeline,
				message: `Unknown pipeline "${project.pipeline}"`,
			});
			continue;
		}
		try {
			(
				manifest[project.pipeline as keyof DispatchManifest] as unknown[]
			).push(mapper(project));
		} catch (err) {
			errors.push({
				key: project.key,
				pipeline: project.pipeline,
				message: (err as Error).message,
			});
		}
	}

	return { manifest, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test devops -- src/lib/ci/manifest.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/devops/src/lib/ci/manifest.ts packages/npm/devops/src/lib/ci/manifest.spec.ts
git commit -m "feat(devops): buildDispatchManifestSafe collects errors instead of throwing"
```

---

### Task 7: github — findActionInTitleSafe + withGitHubRetry

**Files:**
- Modify: `packages/npm/devops/src/lib/client/github/actions.ts`
- Create: `packages/npm/devops/src/lib/client/github/retry.ts`
- Create: `packages/npm/devops/src/lib/client/github/retry.spec.ts`
- Modify: `packages/npm/devops/src/lib/client/github/index.ts`
- Test: `packages/npm/devops/src/lib/client/github/actions.spec.ts`

**Interfaces:**
- Consumes: `_title`, `GithubActionReferenceMap` (existing).
- Produces:
  - `findActionInTitleSafe(title: string, referenceMap: GithubActionReferenceMap[]): string | null` — returns `null` on no match (does not throw).
  - `withGitHubRetry<T>(fn: () => Promise<T>, opts?: GitHubRetryOptions): Promise<T>` where `GitHubRetryOptions = { retries?: number; baseDelayMs?: number; maxDelayMs?: number; sleep?: (ms: number) => Promise<void> }`. Retries on 429, 5xx, secondary-rate-limit 403, and `ETIMEDOUT`/`ECONNRESET`/`ENOTFOUND`; honors `Retry-After`; `sleep` is injectable for tests.

- [ ] **Step 1: Write the failing tests**

Append to `actions.spec.ts`:

```ts
import { findActionInTitleSafe } from './actions';

describe('findActionInTitleSafe (v0.0.21)', () => {
  const map = [{ keyword: 'atlas', action: 'atlas_action' }];
  it('returns the action when matched', () => {
    expect(findActionInTitleSafe('run atlas now', map)).toBe('atlas_action');
  });
  it('returns null on no match instead of throwing', () => {
    expect(findActionInTitleSafe('nothing here', map)).toBeNull();
  });
});
```

Create `retry.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { withGitHubRetry } from './retry';

const noSleep = async () => {};

describe('withGitHubRetry (v0.0.21)', () => {
  it('returns immediately on success', async () => {
    let calls = 0;
    const out = await withGitHubRetry(async () => { calls++; return 'ok'; }, { sleep: noSleep });
    expect(out).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries a 500 then succeeds', async () => {
    let calls = 0;
    const out = await withGitHubRetry(async () => {
      calls++;
      if (calls < 2) throw { status: 500 };
      return 'ok';
    }, { sleep: noSleep });
    expect(out).toBe('ok');
    expect(calls).toBe(2);
  });

  it('does not retry a non-retryable 404', async () => {
    let calls = 0;
    await expect(withGitHubRetry(async () => {
      calls++;
      throw { status: 404 };
    }, { sleep: noSleep })).rejects.toEqual({ status: 404 });
    expect(calls).toBe(1);
  });

  it('exhausts retries then throws', async () => {
    let calls = 0;
    await expect(withGitHubRetry(async () => {
      calls++;
      throw { status: 503 };
    }, { retries: 2, sleep: noSleep })).rejects.toEqual({ status: 503 });
    expect(calls).toBe(3);
  });

  it('retries a secondary-rate-limit 403', async () => {
    let calls = 0;
    const out = await withGitHubRetry(async () => {
      calls++;
      if (calls < 2) throw { status: 403, message: 'You have exceeded a secondary rate limit' };
      return 'ok';
    }, { sleep: noSleep });
    expect(out).toBe('ok');
    expect(calls).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test devops -- src/lib/client/github/actions.spec.ts src/lib/client/github/retry.spec.ts`
Expected: FAIL — `findActionInTitleSafe` and `./retry` do not exist.

- [ ] **Step 3: Implement**

Append to `actions.ts`:

```ts
export function findActionInTitleSafe(
  title: string,
  referenceMap: GithubActionReferenceMap[],
): string | null {
  const sanitizedTitle = _title(title);
  for (const item of referenceMap) {
    if (sanitizedTitle.includes(item.keyword)) {
      return item.action;
    }
  }
  return null;
}
```

Create `retry.ts`:

```ts
export interface GitHubRetryOptions {
	retries?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

function retryAfterMs(err: unknown): number | null {
	const e = err as { response?: { headers?: Record<string, unknown> }; headers?: Record<string, unknown> };
	const raw = e?.response?.headers?.['retry-after'] ?? e?.headers?.['retry-after'];
	if (raw == null) {
		return null;
	}
	const secs = parseInt(String(raw), 10);
	return Number.isFinite(secs) ? secs * 1000 : null;
}

function isRetryable(err: unknown): boolean {
	const e = err as { status?: number; response?: { status?: number }; message?: string; code?: string };
	const status = e?.status ?? e?.response?.status;
	if (status === 429) {
		return true;
	}
	if (typeof status === 'number' && status >= 500) {
		return true;
	}
	if (status === 403) {
		const msg = String(e?.message ?? '').toLowerCase();
		return msg.includes('rate limit') || msg.includes('abuse') || retryAfterMs(err) !== null;
	}
	return e?.code === 'ETIMEDOUT' || e?.code === 'ECONNRESET' || e?.code === 'ENOTFOUND';
}

export async function withGitHubRetry<T>(
	fn: () => Promise<T>,
	opts: GitHubRetryOptions = {},
): Promise<T> {
	const retries = opts.retries ?? 3;
	const baseDelayMs = opts.baseDelayMs ?? 1000;
	const maxDelayMs = opts.maxDelayMs ?? 30000;
	const sleep = opts.sleep ?? defaultSleep;

	let attempt = 0;
	for (;;) {
		try {
			return await fn();
		} catch (err) {
			if (attempt >= retries || !isRetryable(err)) {
				throw err;
			}
			const backoff = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
			const delay = retryAfterMs(err) ?? backoff;
			await sleep(delay);
			attempt++;
		}
	}
}
```

Add to `github/index.ts` (with the other `export * from './...'` lines):

```ts
export * from './retry';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test devops -- src/lib/client/github/actions.spec.ts src/lib/client/github/retry.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/npm/devops/src/lib/client/github/actions.ts packages/npm/devops/src/lib/client/github/actions.spec.ts packages/npm/devops/src/lib/client/github/retry.ts packages/npm/devops/src/lib/client/github/retry.spec.ts packages/npm/devops/src/lib/client/github/index.ts
git commit -m "feat(devops): findActionInTitleSafe + withGitHubRetry backoff wrapper"
```

---

### Task 8: full suite green, version bump, manifest regen

**Files:**
- Modify: `apps/kbve/astro-kbve/src/content/docs/project/devops.mdx:14`
- Modify: `.github/ci-dispatch-manifest.json` (generated)

**Interfaces:**
- Consumes: everything above.
- Produces: published-version source bumped to 0.0.21 and the dispatch manifest regenerated so the publish gate fires.

- [ ] **Step 1: Run the full devops suite**

Run: `pnpm nx test devops`
Expected: PASS — all pre-existing tests (236) plus the new cases green.

- [ ] **Step 2: Verify the build compiles**

Run: `pnpm nx build devops`
Expected: build succeeds; `dist/packages/npm/devops` emitted.

- [ ] **Step 3: Bump the version source**

Edit `apps/kbve/astro-kbve/src/content/docs/project/devops.mdx` line 14:

```
version: "0.0.21"
```

(Leave `packages/npm/devops/version.toml` untouched — CI marker.)

- [ ] **Step 4: Regenerate the dispatch manifest**

Run: `pnpm nx run astro-kbve:sync:ci-manifest`
Expected: `.github/ci-dispatch-manifest.json` devops entry `version` becomes `0.0.21`.

Verify: `git diff .github/ci-dispatch-manifest.json` shows only the devops `version` field changing (0.0.20 → 0.0.21), plus any legitimately pending bumps already staged on dev.

- [ ] **Step 5: Commit**

```bash
git add apps/kbve/astro-kbve/src/content/docs/project/devops.mdx .github/ci-dispatch-manifest.json
git commit -m "release(devops): bump to 0.0.21 + regen ci-dispatch-manifest"
```

---

## Self-Review

**Spec coverage:**
- ci-failure snippet cap → Task 2 ✓ | history bound → Task 3 ✓ | classifyAll + patterns → Task 4 ✓ | body clamp → Task 5 ✓
- manifest safe builder → Task 6 ✓
- github findActionInTitleSafe + withGitHubRetry → Task 7 ✓
- sanitization guards + integer port + single JSDOM → Task 1 ✓
- Release mechanics (MDX bump, manifest regen, version.toml untouched) → Task 8 ✓
- v0.0.22 roadmap → intentionally NOT in this plan (roadmap-only).

**Placeholder scan:** none — every code + test step carries real content.

**Type consistency:** `ParseFailureLogOptions`, `IncrementHistoryOptions`, `SafeManifestResult`/`ManifestError`, `GitHubRetryOptions` are each defined in the task that first uses them; `ci` namespace gains only `classifyAll`; `withGitHubRetry`/`findActionInTitleSafe` names match between Task 7 interfaces, code, and tests.

**Note on deviation from spec:** buildIssueBody uses a single final-clamp (Task 5) rather than "truncate the Error Summary block first" — same guarantee (body ≤ 65536) with less coupling; acceptable per additive intent. `buildDispatchManifest` keeps its exact strict behavior and a new `buildDispatchManifestSafe` is added rather than a `strict` boolean param (return types differ), which is cleaner and still non-breaking.
