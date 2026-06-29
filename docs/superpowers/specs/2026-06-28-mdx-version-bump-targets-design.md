# MDX Version Bump Targets — Design

**Date:** 2026-06-28
**Status:** Approved (pending spec review)
**Scope:** `rows` + `unreal-chuck` (beta/dev channels). Kilobase fix explicitly **out of scope**.

## Problem

Shipping a new release for a `pipeline:`-driven project means bumping **only** the top-level
`version:` field in that project's manifest mdx
(`apps/kbve/astro-kbve/src/content/docs/project/*.mdx`). CI compares the mdx `version:` against
`version_toml`; higher → build, equal → skip. Every other version file (`version.toml`,
`Cargo.toml`, deployment yaml) is owned by CI's post-publish PR and must never be hand-edited.

Today this bump is fully manual: edit the mdx, create an atomic branch off `dev`, commit, push,
and let `ci-atom.yml` open the PR. The separate **KBVE/chuck** repo automates exactly this for the
chuck beta channel via `scripts/bump-beta.sh` (a pure `gh api` flow), but **this monorepo has no
bump command at all**. The only `bump` target in the workspace (`kilobase`) is a dead stub — it
references `tools/scripts/public/kilobase/version_bump.sh`, which was never committed.

We want a one-command bump, invoked the nx way the user already uses:

```bash
./kbve.sh -nx rows:bump                 # auto patch:   0.1.32 -> 0.1.33
./kbve.sh -nx rows:bump --version=0.2.0 # explicit version
./kbve.sh -nx unreal-chuck:bump-beta    # 0.3.45 -> 0.3.46
./kbve.sh -nx unreal-chuck:bump-dev     # 0.3.20 -> 0.3.21
```

(`./kbve.sh -nx <proj>:<target>` runs `pnpm nx run <proj>:<target>` after sourcing `.env.local`.)

## Approach

A single shared **remote `gh api`** engine script, generalized from chuck's `bump-beta.sh`, plus
thin per-project nx `run-commands` targets that invoke it with the right mdx path.

**Why remote `gh api` (not a local worktree edit):** the user's constraint is a _fast atomic with
no `pnpm install` and nothing to clean up afterward_. The `gh api` flow reads the manifest from
`dev`, computes the bump, creates the atomic branch, and commits the one-line change entirely
server-side. It never creates a worktree, never installs dependencies, and never touches the local
working tree — so there is nothing to clean and it runs correctly from any branch (even a dirty
tree). This is exactly the property that makes `bump-beta.sh` safe, and it is the lightest possible
"atomic".

## Components

### 1. Engine script — `tools/scripts/public/bump-mdx-version.sh`

Lives under the same `tools/scripts/public/...` tree the kilobase `bump` convention points at
(`tools/scripts/public` is a symlink → `apps/kbve/astro-kbve/public/data/scripts`). So the real
on-disk file is `apps/kbve/astro-kbve/public/data/scripts/bump-mdx-version.sh`.

**Interface:**

```
bash tools/scripts/public/bump-mdx-version.sh <mdx-path-relative-to-repo-root> [explicit-version]
```

- `<mdx-path>` — required, e.g. `apps/kbve/astro-kbve/src/content/docs/project/rows.mdx`.
- `[explicit-version]` — optional `X.Y.Z`. If omitted, patch-bump the current version.

**Behaviour (mirrors `bump-beta.sh`):**

1. Require `gh` on PATH; `set -euo pipefail`.
2. `REPO="KBVE/kbve"`. Pull the manifest from `dev` into a temp file via
   `gh api "repos/$REPO/contents/$MDX?ref=dev" --jq '.content' | base64 -d` — preserves exact bytes
   and trailing newline, so only the version line changes.
3. Read the **top-level (column-0)** version:
   `grep -m1 -E '^version: "[0-9]+\.[0-9]+\.[0-9]+"'`, then `sed` out the `X.Y.Z`.
   This deliberately ignores the **nested `engine.version:`** (indented) in the chuck manifests.
   Abort if no version found.
4. Compute `NEW`: explicit arg if given, else `MA.MI.$((PA+1))`.
5. Branch name: `atom-<MMDDHHMM>-<slug>` where `slug` = sanitized mdx basename + `NEW` with dots
   stripped (e.g. `atom-06281530-rows-0133`, `atom-06281530-unreal-chuck-beta-0346`). Must match
   `^atom-[a-zA-Z0-9-]+$` and be ≤ 50 chars — validate and abort otherwise (same gate as
   `ci-atom.yml` / `./kbve.sh -atomic`).
6. Resolve `DEVSHA` (`git/ref/heads/dev`) and `MDXSHA` (`contents/$MDX?ref=dev`).
7. Create the branch off dev via `POST repos/$REPO/git/refs`; **reuse** it if it already exists
   (retry-safe).
8. `sed -i` the version line in the temp file, base64-encode, and
   `PUT repos/$REPO/contents/$MDX` with `message="chore(<scope>): bump <CUR> -> <NEW>"`,
   `content`, `sha=$MDXSHA`, `branch=$BR`. The API commit _is_ the push.
9. Print status. **Do NOT open the PR** — pushing the `atom-*` branch triggers `ci-atom.yml`,
   which opens the PR to `dev` (bot-authored, so the human can review/merge it).

**Commit-message scope:** derive a short scope from the mdx basename (`rows` → `rows`,
`unreal-chuck-beta` → `chuck`), or accept it as an optional 3rd arg if needed. Conventional commit,
**no co-author lines** (per AGENTS.md).

**Notes / edge cases:**

- Requires `gh` authenticated with write access to `KBVE/kbve`.
- Idempotent on retry (branch reuse). A second run with the same version produces an equal mdx →
  CI would skip the build; that is acceptable and visible.
- ASCII-only output (no em-dashes etc.) to stay consistent with the repo's workflow-script rule.

### 2. `rows` — add `bump` target

In `apps/rows/project.json`, add:

```json
"bump": {
  "executor": "nx:run-commands",
  "options": {
    "commands": [
      "bash tools/scripts/public/bump-mdx-version.sh apps/kbve/astro-kbve/src/content/docs/project/rows.mdx {args.version}"
    ],
    "parallel": false
  },
  "outputs": [],
  "dependsOn": []
}
```

`{args.version}` expands to empty when `--version` is not passed → script auto-patches. With
`./kbve.sh -nx rows:bump --version=0.2.0` it forwards the explicit version.

### 3. `unreal-chuck` — new nx project with `bump-beta` + `bump-dev`

Both chuck channel manifests declare `source_path: apps/chuckrpg/unreal-chuck`, so that directory is
the natural single project home. Create `apps/chuckrpg/unreal-chuck/project.json` modeled on the
existing `unreal-rentearth` project:

```json
{
	"name": "unreal-chuck",
	"$schema": "../../../node_modules/nx/schemas/project-schema.json",
	"projectType": "application",
	"tags": ["scope:chuck", "type:unreal-app"],
	"targets": {
		"bump-beta": {
			"executor": "nx:run-commands",
			"options": {
				"commands": [
					"bash tools/scripts/public/bump-mdx-version.sh apps/kbve/astro-kbve/src/content/docs/project/unreal-chuck-beta.mdx {args.version}"
				],
				"parallel": false
			},
			"outputs": [],
			"dependsOn": []
		},
		"bump-dev": {
			"executor": "nx:run-commands",
			"options": {
				"commands": [
					"bash tools/scripts/public/bump-mdx-version.sh apps/kbve/astro-kbve/src/content/docs/project/unreal-chuck-dev.mdx {args.version}"
				],
				"parallel": false
			},
			"outputs": [],
			"dependsOn": []
		}
	}
}
```

**No `nx.json` change.** `unreal-rentearth` proves the precedent: it is an established
`type:unreal-app` nx project with no eslint config and no explicit `lint` target, and it coexists in
CI without affected-lint failures. `unreal-chuck` modeled the same way inherits that safety, so the
`@nx/eslint/plugin` exclude considered earlier is unnecessary.

(Confirm during implementation that `pnpm nx show project unreal-chuck` lists exactly `bump-beta`
and `bump-dev` plus whatever the unreal-rentearth precedent shows is harmless.)

## Data flow

```
./kbve.sh -nx rows:bump
  -> pnpm nx run rows:bump            (kbve.sh sources .env.local first)
  -> bash tools/scripts/public/bump-mdx-version.sh .../rows.mdx
       -> gh api: read rows.mdx@dev        (version: "0.1.32")
       -> compute 0.1.33
       -> POST branch atom-<stamp>-rows-0133 off dev
       -> PUT rows.mdx on that branch       (version: "0.1.33", msg "chore(rows): bump ...")
  -> ci-atom.yml opens PR to dev -> review/merge -> dev -> main -> CI builds kbve/rows
```

The working tree is never modified.

## Testing

The bump has a real remote side effect (creates a branch + commit on origin), so it cannot be
"unit tested" without producing a throwaway atom branch. Plan:

1. `shellcheck` the engine script.
2. **Version-parse unit:** factor the read/compute logic so it can be exercised against a local
   fixture mdx (top-level vs nested `engine.version`, missing version, explicit override) without
   any `gh` calls — assert the computed `NEW` for each case.
3. **nx wiring:** `pnpm nx show project rows --json` and `... unreal-chuck --json` to confirm the
   `bump` / `bump-beta` / `bump-dev` targets resolve and the commands are correct (dry inspection,
   not execution).
4. **End-to-end (manual, deliberate):** run `./kbve.sh -nx unreal-chuck:bump-dev` once against a
   real dev manifest, confirm the `atom-*` branch + commit appear on origin and `ci-atom.yml` opens
   the PR, then close/delete the throwaway branch. Do this only when an actual bump is wanted.

## Error handling

- Missing `gh` → clear error, exit 1.
- mdx path not found on `dev` (`gh api` 404) → surface the API error, exit non-zero.
- No top-level `version:` match → explicit error naming the mdx, exit 1.
- Invalid/over-length branch name → abort before any API write.
- Branch already exists → reuse (do not fail).
- `dev` protected / merge-queue → never write to `dev` directly; all writes target the `atom-*`
  branch only (this is why a direct `dev` PUT would 409).

## Out of scope

- Fixing the dead `kilobase:bump` target (repoint at the shared script) — explicitly deferred.
- Bump targets for any other `pipeline:docker` projects beyond `rows`.
- A bump target for the chuckrpg **docker server** (`chuckrpg.mdx` / `axum-chuckrpg`).
- `--minor` / `--major` convenience flags (explicit `--version=` covers these; YAGNI).
