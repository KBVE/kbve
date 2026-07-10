# GitOps — CI Failure Tracker

Logic for the CI failure-tracker lives in `@kbve/devops`, not in workflow YAML.
The workflow is a thin caller; rules (log parsing, cause classification, issue
markdown) are versioned, unit-tested library code. Changing a rule means editing
the library and publishing — never editing the workflow.

## Components

| Piece    | Path                                                                                                                          | Role                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Library  | [`packages/npm/devops/src/lib/client/github/ci-failure.ts`](../../../packages/npm/devops/src/lib/client/github/ci-failure.ts) | Parse logs, classify cause, build issue/comment markdown                                               |
| Tests    | `packages/npm/devops/src/lib/client/github/ci-failure.spec.ts`                                                                | 31 unit tests; gates `devops:lint` + `devops:test`                                                     |
| Workflow | [`.github/workflows/utils-ci-failure-tracker.yml`](../../../.github/workflows/utils-ci-failure-tracker.yml)                   | Reusable (`workflow_call`); installs `@kbve/devops@latest`, drives the API via `actions/github-script` |

## Flow

```
caller workflow (status: failure|success)
  → utils-ci-failure-tracker.yml (workflow_call)
    → setup-node 22 + npm i @kbve/devops@latest
    → github-script:
        failure + no open issue  → gha.ci.buildIssueBody     → issues.create
        failure + open issue     → gha.ci.buildComment        → comment
                                   gha.ci.incrementHistory    → issue.update (count++ , history row)
        success + open issue     → gha.ci.buildResolveComment → comment + close
```

Issue dedup: title `[CI] <workflow> / <job> — Failed` (`gha.ci.issueTitle`),
matched against open issues labelled `ci`.

## API (`gha.ci` namespace — canonical)

As of v0.0.22 the whole GitHub-helper surface is one grouped namespace, `gha`.
The tracker uses `gha.ci.*`. The same object is still exported top-level as `ci`
(`gha.ci === ci`), so either import works.

```ts
import { gha } from '@kbve/devops';
const { ci } = gha;

ci.issueTitle(workflowName, jobName); // dedup title
ci.parseFailureLog(rawLog, opts?); // { snippet, nxTargets } — opts caps snippet chars + context window
ci.classifyFailure(rawLog); // first-match reason string | null
ci.classifyAll(rawLog); // all matching reasons string[] (multi-cause)
ci.buildIssueBody(meta); // new-issue markdown, clamped to GitHub's 65536-char limit
ci.buildComment(meta); // repeat-failure comment
ci.buildResolveComment(meta); // success/close comment
ci.incrementHistory(oldBody, entry, opts?); // bump count + append row; opts.maxRows bounds the table
ci.failurePatterns; // CIFailurePattern[]
```

`opts` are optional with defaults reproducing prior behavior (`maxSnippetChars`
12000, `contextBefore` 30 / `contextAfter` 4, `maxRows` 20), so existing calls
are unchanged. Added in v0.0.21.

### Log scoping (token budget)

`parseFailureLog` is why the tracker is cheap to read. Raw GitHub job logs are
ANSI-coded, timestamp-prefixed, and padded with build progress. It:

1. strips ANSI escape sequences and the leading `YYYY-MM-DDTHH:MM:SSZ` prefix,
2. drops cargo/npm progress (`Checking`/`Compiling`/`Downloading`/…) and
   `##[group]` markers,
3. windows ±30 lines around the **last** error marker (not a blind `tail`),
4. surfaces the failing Nx targets (`Failed tasks:` → `devops:lint api:build`),
5. clamps the snippet to a char budget (default 12000, head+tail with a
   `… [snipped N chars] …` marker) so an oversized log can't blow the issue
   body past GitHub's 65536-char limit — `buildIssueBody` re-clamps the whole
   body as a final backstop.

Result: the issue shows the real error, not a wall of ANSI noise.

### Cause classification

`failurePatterns` is an ordered registry of `{ test: RegExp, reason }`.
`classifyFailure` returns the first match; `classifyAll` returns every match
(a log can trip more than one cause). Add a new known failure mode by appending
one entry — no workflow change. Current entries (8): Forgejo LFS auth, OOM kill,
job timeout, network/DNS, lockfile out-of-sync, disk-full, Git LFS smudge 404,
git auth.

## Naming + deprecation

Canonical API is the `gha` grouped namespace (`gha.ci.*`, `gha.issues.*`,
`gha.actions.*`, `gha.pulls.*`, `gha.docker.*`, `gha.context.*`, `gha.withRetry`).
The legacy `_$gha_*` exports remain as `@deprecated` aliases so published-package
consumers keep working; internal code no longer references them. New code imports
`gha.*`. Removing the aliases is a breaking change tracked in a follow-up issue.

```ts
import { gha } from '@kbve/devops';
gha.issues.createComment(github, context, body);

/** @deprecated Use `gha.issues.createComment`. */
export const _$gha_createIssueComment = createComment;
```

Spec/plan: `docs/superpowers/specs/2026-07-02-devops-0022-gha-namespace-design.md`,
`docs/superpowers/plans/2026-07-02-devops-0022-gha-namespace.md`.

## Publish dependency

The workflow runs `npm i @kbve/devops@latest`, so any library change only takes
effect in CI **after `@kbve/devops` is published**. Version bumps follow the
monorepo release flow (MDX-driven), not manual edits. Until the version carrying
a change ships, `@latest` lacks it.

## Status

- **v0.0.20** — `ci-failure.ts` re-landed and published (the `ci` namespace +
  `_$gha_*` aliases).
- **v0.0.21** — library hardening (additive): snippet + issue-body caps, bounded
  history table, `classifyAll` + 5 new failure patterns, plus robustness beyond
  the tracker — `buildDispatchManifestSafe`, `findActionInTitleSafe`, and
  `withGitHubRetry` (backoff, honors `Retry-After`). All wired into the entrypoint
  with a root-import smoke test.
- **v0.0.22** — `gha` grouped namespace retires the `_$gha_*` prefix (additive;
  aliases kept). Internal callers migrated onto `gha.*`.
- **Pending — publish confirm + workflow re-wire:** verify 0.0.21 + 0.0.22 on
  npm, then switch `utils-ci-failure-tracker.yml` from its inline shell/`gh`
  implementation to the thin `npm i @kbve/devops@latest` + `github-script` caller
  driving `gha.ci.*` (the Flow above), adding `permissions: actions: read` to
  callers. Tracked in the gitops epic.

## Gotchas

- ANSI regex must not embed a literal control char — eslint `no-control-regex`
  fails `devops:lint`. Build it from `String.fromCharCode(27)`.
- `package.json` dependency ranges must satisfy the lockfile version or
  `@nx/dependency-checks` fails `devops:lint`.
