# @kbve/devops Hardening — v0.0.21 (additive) + v0.0.22 roadmap

**Date:** 2026-07-02
**Package:** `packages/npm/devops`
**Version target:** 0.0.20 → 0.0.21
**Compat stance:** Additive, non-breaking. Every existing signature and `_$gha_*` behavior preserved. Robustness added via optional parameters (sane defaults) and new safe-variant functions.

## Motivation

The `ci-failure` module was just re-landed (0.0.20) and will soon be imported by the CI failure-tracker workflow (deferred "PR B"). Before wiring live consumers, harden the library so a large log, a malformed registry entry, a GitHub secondary-rate-limit, or an undefined input cannot break a CI run. This is a robustness pass across four modules with no new public surface beyond opt-in helpers.

## Scope

Four modules. All changes test-first — each fix adds a spec case.

### 1. ci-failure (`src/lib/client/github/ci-failure.ts`)

Latent defects: issue body has no size cap (GitHub rejects bodies over 65536 chars → API 422); failure-history table grows unbounded; `classifyFailure` returns only the first pattern match; parse windows are unnamed magic numbers.

- `parseFailureLog(rawLog, opts?)` — add optional `opts: { maxSnippetChars?: 12000; contextBefore?: 30; contextAfter?: 4 }`. Existing single-arg calls unchanged. Snippet is clamped to `maxSnippetChars` (truncate middle, keep head + tail, insert `… [snipped N chars] …`). Magic numbers 30/4/21 become named defaults.
- `incrementHistory(oldBody, entry, opts?)` — add optional `opts: { maxRows?: 20 }`. When data rows exceed `maxRows`, drop the oldest rows (keep header separator + the running `Consecutive failures` count). Current behavior appends forever.
- `classifyFailure(log)` — unchanged (first match). Add `classifyAll(log): string[]` returning every matching reason for multi-cause logs.
- `CI_FAILURE_PATTERNS` — extend with: network/DNS (`ETIMEDOUT|ENOTFOUND|getaddrinfo|connection reset`), lockfile/pnpm (`ERR_PNPM_.*|frozen-lockfile.*outdated|lockfile.*mismatch`), disk-full (`ENOSPC|no space left`), LFS smudge 404 (`smudge filter lfs failed|error downloading object.*404`), git auth (`fatal: could not read Username|Permission denied \(publickey\)`). List stays exported and appendable.
- `buildIssueBody(meta)` — clamp the fully-assembled body to 65536 chars as a final safety net (truncate the Error Summary block first, append truncation marker).
- All new behavior surfaced through the `ci` namespace object; `_$gha_*` aliases untouched.

### 2. ci/manifest + registry (`src/lib/ci/manifest.ts`, `registry.ts`)

`buildDispatchManifest()` throws on the first project missing a required field — one bad registry entry wedges the entire manifest regen (the class of silent-stall that bit #13615).

- `buildDispatchManifest(opts?)` — add optional `opts: { strict?: true }`. Default `strict:true` preserves current throw-on-first-error behavior.
- New `buildDispatchManifestSafe(): { manifest: DispatchManifest; errors: Array<{ key: string; pipeline: string; message: string }> }` — collects per-project mapper errors, skips bad entries, returns partial manifest plus the error list. Callers (the regen script) can log/aggregate instead of hard-failing.

### 3. client/github rest (`src/lib/client/github/actions.ts`, `issues.ts`)

`_$gha_findActionInTitle` throws when no keyword matches, forcing try/catch on every caller. REST calls have no handling for GitHub secondary-rate-limits (HTTP 403 with `Retry-After`) or transient 5xx.

- `_$gha_findActionInTitle` / `_$gha_kbve_ActionProcess` — unchanged (still throw). Add `findActionInTitleSafe(title, referenceMap): string | null` returning `null` on no match.
- New `withGitHubRetry(fn, opts?)` — wrapper that retries `fn` on 403 secondary-rate-limit, 5xx, and `ETIMEDOUT`/`ECONNRESET`, honoring `Retry-After` when present, else exponential backoff. `opts: { retries?: 3; baseDelayMs?: 1000; maxDelayMs?: 30000 }`. Opt-in; existing issue/action calls stay as-is. Delay is injectable for tests (no real timers in specs).

### 4. sanitization (`src/lib/sanitization.ts`)

`_title`, `_md_safe_row`, `stripNonAlphanumeric`, and `markdownToJsonSafeString` throw on `null`/`undefined` (`.slice`/`.replace`/`marked.parse` on non-string). `sanitizePort` accepts non-integer floats. `markdownToJsonSafeString` builds two JSDOM windows.

- Add non-string guards to `_title`, `_md_safe_row`, `stripNonAlphanumeric`, `markdownToJsonSafeString` — return `''` (or `'""'` JSON-safe empty) instead of throwing.
- `sanitizePort` — reject non-integers via `Number.isInteger` (current check lets `80.5` pass).
- `markdownToJsonSafeString` — reuse a single JSDOM window for sanitize + text extraction.

## Non-goals (v0.0.21)

- No renaming of `_$gha_*` (that is v0.0.22).
- No changes to the CI failure-tracker workflow (deferred PR B — separate from this release).
- No new modules or client surfaces.

## Testing

- Extend existing `*.spec.ts` in each module. Cover: oversized log → capped snippet + body ≤ 65536; history at cap → oldest row dropped, count still increments; `classifyAll` multi-match; each new pattern; `buildDispatchManifestSafe` with a deliberately-broken entry → partial manifest + error; `findActionInTitleSafe` no-match → null; `withGitHubRetry` retries then succeeds / exhausts (injected delay); sanitizer null/undefined → safe empty; `sanitizePort(80.5)` throws.
- Full `nx test devops` must stay green (currently 236 passing).

## Release mechanics

- Bump only `apps/kbve/astro-kbve/src/content/docs/project/devops.mdx` `version: "0.0.20"` → `"0.0.21"`. `version.toml` stays the CI post-publish marker (do not hand-edit).
- Regenerate `.github/ci-dispatch-manifest.json` via `nx run astro-kbve:sync:ci-manifest` after the MDX bump.
- PR dev → main; dev→main promotion publishes to npm.

## v0.0.22 roadmap — `_$gha_*` → grouped namespaces (prepare only)

Not implemented in this release. Direction, recorded so 0.0.21's additive helpers are shaped to fit it:

- Replace the `_$gha_*` prefix with grouped namespace objects mirroring the existing `ci.*` pattern: `gha.issues.*`, `gha.actions.*`, `gha.ci.*` (and `gha.pulls.*`, `gha.docker.*`).
- Each old `_$gha_name` becomes a `@deprecated` alias pointing at the grouped member; remove in a later minor.
- One import (`import { gha } from '@kbve/devops'`), discoverable via autocomplete.
- v0.0.22 gets its own spec + plan cycle. This release must not introduce new `_$gha_*`-prefixed exports (use plain names + namespace membership) so the 0.0.22 swap is purely additive-to-deprecated.
