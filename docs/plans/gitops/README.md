# GitOps — CI Failure Tracker

Logic for the CI failure-tracker lives in `@kbve/devops`, not in workflow YAML.
The workflow is a thin caller; rules (log parsing, cause classification, issue
markdown) are versioned, unit-tested library code. Changing a rule means editing
the library and publishing — never editing the workflow.

## Components

| Piece    | Path                                                                                                                          | Role                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Library  | [`packages/npm/devops/src/lib/client/github/ci-failure.ts`](../../../packages/npm/devops/src/lib/client/github/ci-failure.ts) | Parse logs, classify cause, build issue/comment markdown                                               |
| Tests    | `packages/npm/devops/src/lib/client/github/ci-failure.spec.ts`                                                                | 22 unit tests; gates `devops:lint` + `devops:test`                                                     |
| Workflow | [`.github/workflows/utils-ci-failure-tracker.yml`](../../../.github/workflows/utils-ci-failure-tracker.yml)                   | Reusable (`workflow_call`); installs `@kbve/devops@latest`, drives the API via `actions/github-script` |

## Flow

```
caller workflow (status: failure|success)
  → utils-ci-failure-tracker.yml (workflow_call)
    → setup-node 22 + npm i @kbve/devops@latest
    → github-script:
        failure + no open issue  → ci.buildIssueBody    → issues.create
        failure + open issue     → ci.buildComment       → comment
                                   ci.incrementHistory   → issue.update (count++ , history row)
        success + open issue     → ci.buildResolveComment → comment + close
```

Issue dedup: title `[CI] <workflow> / <job> — Failed` (`ci.issueTitle`), matched
against open issues labelled `ci`.

## API (`ci` namespace — canonical)

```ts
import { ci } from '@kbve/devops';

ci.issueTitle(workflowName, jobName); // dedup title
ci.parseFailureLog(rawLog); // { snippet, nxTargets }
ci.classifyFailure(rawLog); // reason string | null
ci.buildIssueBody(meta); // new-issue markdown
ci.buildComment(meta); // repeat-failure comment
ci.buildResolveComment(meta); // success/close comment
ci.incrementHistory(oldBody, entry); // bump count + append history row
ci.failurePatterns; // CIFailurePattern[]
```

### Log scoping (token budget)

`parseFailureLog` is why the tracker is cheap to read. Raw GitHub job logs are
ANSI-coded, timestamp-prefixed, and padded with build progress. It:

1. strips ANSI escape sequences and the leading `YYYY-MM-DDTHH:MM:SSZ` prefix,
2. drops cargo/npm progress (`Checking`/`Compiling`/`Downloading`/…) and
   `##[group]` markers,
3. windows ±30 lines around the **last** error marker (not a blind `tail`),
4. surfaces the failing Nx targets (`Failed tasks:` → `devops:lint api:build`).

Result: the issue shows the real error, not a wall of ANSI noise.

### Cause classification

`failurePatterns` is an ordered registry of `{ test: RegExp, reason }`. First
match wins. Add a new known failure mode by appending one entry — no workflow
change. Current entries: Forgejo LFS auth, OOM kill, job timeout.

## Naming + deprecation

Canonical API is the `ci` namespace (clean camelCase). The legacy
`_$gha_*` exports remain as `@deprecated` pointers to the same functions so the
published-package consumers (the workflow on `@latest`) keep working. New code
imports `ci.*`. Remove the aliases once no consumer references them.

```ts
/** @deprecated Use `ci.parseFailureLog`. */
export const _$gha_parseFailureLog = parseFailureLog;
```

## Publish dependency

The workflow runs `npm i @kbve/devops@latest`, so any library change only takes
effect in CI **after `@kbve/devops` is published**. Version bumps follow the
monorepo release flow (MDX-driven), not manual edits. Until the version carrying
`ci-failure.ts` ships, `@latest` lacks these exports.

## Gotchas

- ANSI regex must not embed a literal control char — eslint `no-control-regex`
  fails `devops:lint`. Build it from `String.fromCharCode(27)`.
- `package.json` dependency ranges must satisfy the lockfile version or
  `@nx/dependency-checks` fails `devops:lint`.
