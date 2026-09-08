# GitOps — Tag-Driven Releases

Goal: **one action, either kind.** Bump the MDX _or_ push the tag — whichever
suits the moment — and the release converges on its own. CI verifies, builds,
publishes, pins the cluster, and writes the version back into every manifest and
the MDX doc.

```
git push origin edge@0.1.51        ← release by tag
        ── or ──
bump version: in edge.mdx, merge   ← release by doc, CI creates the tag
```

Both paths reach the same place. Neither requires touching a manifest by hand.

Today the tag is the trigger but not the whole act: the version must already be
committed in the project's manifest before the tag is pushed, or `verify` fails.
That pre-work is what this plan removes.

## Why this is a regression, not a redesign

The MDX-era flow was one edit: bump `version:` in the project's `.mdx`, merge,
and a bot synced `version.toml`, the language manifest and the kube image pin.
The tag migration replaced the trigger and deleted the bot's _invocation_ — not
the bot. `utils-post-publish.yml` still carries the write-back inputs; the
release workflow passes them empty on purpose:

```yaml
# .github/workflows/release.yml:307
version_toml_path: ''
```

```yaml
# .github/workflows/utils-post-publish.yml:14-18
version_toml_path:
    description: >-
        Path to version.toml. Optional: a tag-driven release has the
        version committed and verified before it runs, so it asks for
        no write-back.
```

So the capability was switched off, not removed. This plan switches it back on
and points the tag at it.

## What is broken today

Measured against the tree, not assumed:

| Finding                                                  | Evidence                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~`check-drift.sh` checks nothing~~ **fixed**            | Was: all 27 `SKIP`, exit 0, `REPO_ROOT` off by one. Fixed in `99a411358b` (`../..`). Now reports 18 synced, 1 drift, 8 skipped.                                    |
| Its hardcoded list is still stale                        | 7 of 27 source paths do not exist (`packages/rust/*` → `crates/*`) — the 8 remaining `SKIP`s.                                                                      |
| It only covers a third of the tree                       | 27 hardcoded vs **88** release-capable moon projects.                                                                                                              |
| MDX docs have rotted                                     | 7 drifted. `chisel-ubuntu-axum`: manifest `24.04.13` (two real tagged releases) vs MDX `24.04.11`. Nothing syncs MDX any more.                                     |
| `edge` carries two version files and only one is checked | `version.toml` is what release tooling reads; `deno.json` is what the Dockerfile bakes into the runtime `VERSION` that `/health` reports. Nothing reconciles them. |

`edge` is the only project with the two-file shape (checked across all 88).

## Current mechanism (verified)

| Piece                   | Path                                                                                              | Role                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger                 | [`.github/workflows/release.yml:16-19`](../../../.github/workflows/release.yml)                   | `on: push: tags: ['*@*']`. Nothing fires on push to a branch or on a PR.                                                                                                                                       |
| Tag → project           | [`tools/release/verify-tag.mjs`](../../../tools/release/verify-tag.mjs) `parseTag`, `projectNode` | Splits on the last `@`; resolves the project id against `moon query projects`.                                                                                                                                 |
| Version source of truth | `verify-tag.mjs` `manifestVersion`                                                                | Fixed precedence: `Cargo.toml` → `package.json` → `pyproject.toml` → `src-tauri/tauri.conf.json` → `project.godot` → `version.toml`. **`deno.json` is not in the list**, so `edge` resolves to `version.toml`. |
| Lane selection          | `verify-tag.mjs` `lanes`                                                                          | Reads the moon project's `tags` array. `docker` → the docker lane.                                                                                                                                             |
| Publish                 | [`utils-publish-docker-image.yml:216`](../../../.github/workflows/utils-publish-docker-image.yml) | `moon run <project>:<target>-publish` → for `edge`, `edge:containerx-publish`.                                                                                                                                 |
| Cluster pin             | [`utils-post-publish.yml:272`](../../../.github/workflows/utils-post-publish.yml)                 | `sed -i "s\|image: ${IMAGE}:.*\|image: ${IMAGE}:${VERSION}\|g"` into the manifests named by `KUBE_DEPLOYMENT_YAMLS`.                                                                                           |
| Failure withdrawal      | [`release.yml:506-559`](../../../.github/workflows/release.yml)                                   | Deletes the tag and draft release automatically, opens one deduped `release-failure` issue.                                                                                                                    |

### The blocking check

```js
// tools/release/verify-tag.mjs:398-405
if (manifest.version !== version) {
	throw new TagError(
		`Tag ${tag} claims version ${version}, but ${manifest.file} says ` +
			`${manifest.version}.\n\nEither the version bump was not committed ` +
			`before tagging, or the tag has a typo. ...`,
	);
}
```

This is the single line that forces the manifest bump to precede the tag.

### Retry safety (already good)

A failed tag is withdrawn automatically — no human deletes anything. The version
is only _spent_ if crates.io, npm or PyPI accepted an upload, since those refuse
re-publication (`release.yml:531-537`). `edge` is a docker-only lane, and docker
pushes are repeatable, so **a failed `edge` tag is always retryable on the same
number**. This property must survive the change.

## Proposed model

Either input states intent. CI makes everything else match it.

```
        MDX bump merged to dev              tag pushed
                 │                               │
                 ▼                               │
        ci-release-intent.yml                    │
        (on: push: paths: <project mdx>)         │
                 │                               │
        MDX > newest tag?                        │
                 │ yes                           │
                 ▼                               │
        create + push <project>@<mdx version>    │
        with UNITY_PAT (GITHUB_TOKEN cannot      │
        trigger another workflow)                │
                 │                               │
                 └───────────────┬───────────────┘
                                 ▼
                    release.yml (on: push: tags: ['*@*'])
                                 │
       ├─ verify   tag → project via moon graph
       │           manifest MUST NOT be AHEAD of the tag (see below)
       │
       ├─ sync     write the version into every file the project carries
       │           (version.toml, deno.json, MDX) on a branch off dev
       │
       ├─ test     project's own test lane
       │
       ├─ docker   moon run edge:containerx-publish
       │
       ├─ deploy   sed the image pin into KUBE_DEPLOYMENT_YAMLS
       │           → one auto-merged atom PR carrying sync + pin
       │
       └─ cleanup  on failure: delete tag + release, open one issue
```

There is exactly one release path. The MDX trigger does not publish anything —
it only creates the tag, then gets out of the way. That keeps a single place
where a release can go wrong, and means the MDX route inherits the tag route's
failure withdrawal for free.

### Convergence rule

Three version claims can exist for a project: the MDX, the manifest, and the
newest tag. They are not equal authorities:

| Claim                               | Means                              | Authority                          |
| ----------------------------------- | ---------------------------------- | ---------------------------------- |
| Newest tag                          | What actually shipped              | **Ground truth.** Never rewritten. |
| MDX / manifest above the newest tag | Someone declared an intent to ship | Release it.                        |
| MDX / manifest below the newest tag | A stale copy that missed a sync    | Sync it forward silently.          |

So the rule is _not_ "highest number wins" — that would be wrong in both
directions. Measured against the tree today, divergence runs both ways:

```
agones-factorio-relay  mdx=0.0.8     manifest=0.0.1     tag=none      MDX AHEAD
agones-palworld-relay  mdx=0.0.15    manifest=0.0.1     tag=none      MDX AHEAD
agones-shim            mdx=0.0.4     manifest=0.0.0     tag=none      MDX AHEAD
kilobase               mdx=17.6.1    manifest=17.4.1    tag=none      MDX AHEAD
steamcmd-ubuntu        mdx=0.1.0     manifest=0.0.0     tag=none      MDX AHEAD
tocloud9-gameserver    mdx=0.0.13    manifest=0.0.12    tag=none      MDX AHEAD
chisel-ubuntu-axum     mdx=24.04.11  manifest=24.04.13  tag=24.04.13  MANIFEST AHEAD
```

"Highest wins" would re-release `chisel-ubuntu-axum` — its manifest is ahead
only because two releases actually shipped and the MDX never caught up. Under
the tag-arbitrated rule it correctly resolves to a **no-op sync to 24.04.13**,
while the six MDX-ahead projects resolve to a release of the MDX version.

### Guarding the MDX trigger

The MDX path creates a tag automatically, so it needs the same care as any
automation that can publish:

- **Only fires when MDX is strictly above the newest tag.** Equal or below is a
  sync, never a release. This is what stops a docs-only edit — a typo fix, a
  sidebar reorder — from shipping anything.
- **Requires a resolvable `app_name`.** 7 MDX files name something that is not a
  moon project (`unity-rareicon.mdx` → `rareicon`, `unreal-chuck-beta.mdx` →
  `chuck`). Those must fail loudly rather than tag the wrong project.
- **Requires the project to carry a release lane tag.** A project with no lane
  cannot publish; tagging it would only produce a failed release.
- **Actor allowlist**, matching `ci-atom.yml`'s existing convention.
- **One tag per version, ever.** If the tag already exists, do nothing — never
  move or re-push it.

### Change 1 — invert the version check

`verify()` currently demands equality. It becomes a direction check:

| Manifest vs tag   | Meaning                                           | Action                                                                                       |
| ----------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `manifest < tag`  | Normal. Tag is the new intent.                    | Proceed; CI writes the manifest forward.                                                     |
| `manifest == tag` | Already bumped by hand, or a re-run.              | Proceed; write-back is a no-op.                                                              |
| `manifest > tag`  | Tag names a version older than what is committed. | **Fail.** Almost certainly a typo, and publishing it would move a released number backwards. |

Comparison uses the existing `compareSemver` from `notes.mjs` — already imported
by `status.mjs`, so no new dependency.

The error text for the failing case must keep naming the file and both versions,
the way the current message does.

### Change 2 — re-enable the write-back, and add MDX

`release.yml` passes the real paths instead of `''`. `verify` already outputs
`file` (the manifest `manifestVersion` chose) and `source`, so the paths are
derived, never hardcoded.

Two extensions to `utils-post-publish.yml`:

1. **Every version file, not one.** `edge` carries `version.toml` _and_
   `deno.json`. The sync must write all files a project declares, so a second
   Deno service inherits the behaviour without a code change.
2. **MDX sync.** Rewrite `version:` in the project's `.mdx` when one exists.
   This is what stops the doc rot found above.

Note the allowlist guard at `utils-post-publish.yml:348-362`: any file changed
outside `EXPECTED_FILES` aborts the run. **Both new file classes must be added
to that list**, or the sync will abort rather than silently pass.

### Change 3 — the MDX trigger

A new thin workflow, `ci-release-intent.yml`:

```yaml
on:
    push:
        branches: [dev]
        paths: ['docs/project/*.mdx']
```

It reads the changed MDX files, resolves `app_name` through the moon graph,
compares `version:` against the newest `<app>@*` tag, and pushes a tag when the
MDX is strictly ahead. It publishes nothing itself.

The project docs moved to root `docs/project/` in `844dad63a0`, out of
`apps/kbve/astro-kbve/src/content/docs/`. That matters here beyond the path
string: a release trigger watching a path inside one Astro app was coupling the
release system to that app's layout, and this plan would have hardcoded the old
location. At the root the collection is monorepo-scoped, which is what a
release input should be. The frontmatter contract the trigger depends on —
`app_name`, `version`, `version_toml`, `version_target` — survived the move
unchanged.

Note `edge.mdx` already carries `version_target: services/functions/deno/deno.json`.
The MDX has been naming the second version file all along; nothing was reading
it. Change 2's "write every version file" can therefore be driven by frontmatter
the docs already declare, rather than by new per-project configuration.

**It must push with `UNITY_PAT`, not `GITHUB_TOKEN`.** A tag pushed with the
default token does not trigger `release.yml` — GitHub suppresses workflow runs
from workflow-created refs. This repo already hit this and already solved it:
`release.yml:311-316` maps `TRIGGER_PAT: ${{ secrets.UNITY_PAT }}` with a
comment explaining the same trap. Without this the MDX route silently does
nothing.

The comparison logic belongs in a tested `.mjs` under `tools/release/`, not in
workflow YAML — matching the pattern this directory's README states for the CI
failure tracker. `verify-tag.mjs` already exports `projectNode`, `lanes` and
`manifestVersion`; `notes.mjs` exports `compareSemver` (verified: returns
-1/0/1). The workflow stays a thin caller.

### Change 4 — fold `check-drift.sh` into `audit.mjs`

Not a straight delete. `99a411358b` fixed its `REPO_ROOT`, so it now reports
real data — 18 synced, 1 drift, 8 skipped — and it is the only tool that
compares against the **live registries** (npm, crates.io, PyPI, GHCR).
`status.mjs` is deliberately local-only and says so:

> Registries answer a different question -- whether an upload landed -- and
> asking 79 of them turns a command you run while thinking into one you run
> while waiting.

So there are two distinct questions, and only one is covered by the graph-driven
tools:

| Question                                      | Tool                               | State                       |
| --------------------------------------------- | ---------------------------------- | --------------------------- |
| Does the manifest match the newest tag?       | `status.mjs`                       | Graph-driven, all 88, works |
| Does every lane-tagged project resolve?       | `audit.mjs` (`release-tools:lint`) | Graph-driven, all 88, works |
| Did the artifact actually reach the registry? | `check-drift.sh`                   | 27 hardcoded, 8 stale paths |

The plan: move the registry check into `audit.mjs` behind a flag (off by default,
so `moon ci` stays fast), driven by the moon graph instead of the 27-entry list.
Then delete `check-drift.sh` — including its 8 stale paths — rather than fixing
a list that will rot again.

Its 1 current real drift should be triaged before deletion, not discarded.

## Ordering decision: sync before docker

For `edge` the Dockerfile bakes `deno.json` into the runtime `VERSION` constant
that `/health` reports:

```
# services/functions/deno/Dockerfile:5
# Version comes from deno.json (developer source of truth).
```

If the sync runs _after_ the docker lane, image `0.1.51` ships reporting
`0.1.50` until the atom PR merges. So the sync must land **before** the build.

This is the only lane where the ordering is observable, but it is the lane this
plan is being built for.

### Branch: both routes resolve at `dev`

The two triggers are not symmetric, and the asymmetry is the point.

| Trigger  | Where it is watched                   | Why                                                                     |
| -------- | ------------------------------------- | ----------------------------------------------------------------------- |
| MDX edit | `on: push: branches: [dev]`           | Must be the branch the sync writes back to, or the loop never closes.   |
| Tag push | Branch-independent (`on: push: tags`) | A tag names a commit, not a branch. It fires wherever the commit lives. |

A tag having no branch raises the obvious question: **if the tag route writes
the MDX back, which branch receives it?**

Answer: `dev`, unconditionally — and the existing write-back already works this
way, so nothing new is required. `utils-post-publish.yml` never uses the tag as
a base:

```yaml
# utils-post-publish.yml:149-152
- name: Checkout dev
  uses: actions/checkout@v7
  with:
      ref: dev
```

```yaml
# utils-post-publish.yml:474-475
gh pr create \
--base dev \
```

The tag reaches this job only as `inputs.version` — a plain string produced by
`verify`, never a git ref. So the sync checks out `dev` fresh, branches to
`atom-post-publish-<app>-v<version>`, and PRs back into `dev`, regardless of
which commit or branch the tag pointed at.

That gives one convergence point for both routes:

```
tag push (any commit) ─┐
                       ├─→ release.yml ─→ sync job ─→ branch off dev ─→ PR --base dev
MDX bump on dev ───────┘                   (checks out dev, ignores the tagged ref)
```

A tag pushed from a feature branch, a worktree, or a detached HEAD still lands
its MDX and manifest sync on `dev`. The tag is the release record; `dev` is
where the tree converges.

Two consequences worth stating rather than discovering later:

- **Tagging a commit that is not an ancestor of `dev` still syncs to `dev`.**
  The manifest written there describes a version built from a commit `dev` may
  not contain. This is already true of the current pipeline, but the MDX sync
  makes it visible in the docs. Releases should be tagged from commits reachable
  from `dev`.
- **`main` is never watched and never written.** It receives all of this through
  the normal `dev → main` merge. Watching MDX on `main` would put the trigger on
  one branch and the convergence on another — the bump fires on `main`, CI
  writes to `dev`, and `main` keeps the stale value until the next merge. That
  loop does not close. (`main` and `dev` are currently identical, so this is
  latent rather than broken today.)

### The consequence to be explicit about

A tag points at the commit it named. The sync commits to `dev` afterward
(`utils-post-publish.yml:149-152` checks out `dev`, not the tagged ref). So the
tagged commit itself will _not_ contain the bumped manifest — the tree converges
on `dev`, one commit later.

That is a real trade and the main argument against this design: `git show
edge@0.1.51` will show a manifest saying `0.1.50`. Mitigation options, to decide
before building:

- **Accept it.** The tag is the release record; the atom PR is the audit trail.
  Simplest, and matches how the MDX flow behaved.
- **Re-tag after sync.** CI force-moves the tag onto the sync commit. Rejected:
  moving a released tag is exactly what the current error text forbids, and it
  breaks anyone who already fetched it.
- **Build from the synced commit.** The docker lane checks out the atom branch
  rather than the tag. Keeps the image honest at the cost of building something
  the tag does not point at.

Recommendation: **accept it**, and have the sync commit message name the tag so
the link is greppable in both directions.

## Rollout

Scope this to `edge` first. It is the project that motivated the work, it has
**never been tagged** (`git tag -l 'edge@*'` is empty), and it is docker-only so
a failed attempt costs nothing but a retry.

1. Land this session's edge work (response hardening, edge-runtime `v1.76.2`,
   Deno 2.1.4 fixes, 129 shared tests) with both version files at `0.1.51`,
   under the _current_ rules — bump committed before tag.
2. Push `edge@0.1.51`. First real exercise of the release pipeline for `edge`.
   Confirm: image published, manifest pinned, cluster rolls, `/health` reports
   `0.1.51`.
3. Build Changes 1, 2 and 4 (direction check, write-back, drift retirement).
   Release `edge@0.1.52` by tag — the first tag-leads-manifest release.
4. Only then add Change 3, the MDX trigger, and release `edge@0.1.53` by MDX
   bump alone. This is the step that proves the two paths converge.
5. Widen to the other 87 projects once both routes have gone through cleanly.

The ordering matters: each step exercises one new thing against a project whose
previous step is known good. Building the MDX trigger before the tag route works
would mean debugging tag creation and tag consumption simultaneously.

## Open questions

- **Release schedule.** Raised but still unspecified. Options: a cron that
  auto-tags projects whose manifest moved since their last tag; a weekly train;
  or purely on-demand. `status.mjs` already computes "manifest ahead of newest
  tag" for all 88 projects, so the data for an auto-tagger exists. Note this
  becomes _cheaper_ under the dual-trigger design — a scheduler would push tags,
  which is already one of the two supported entry points, so it needs no new
  release path. Not assumed here.
- **MDX for the 47 uncovered projects.** Only 41 of 88 releasable projects have
  an MDX. The sync should skip a project with no MDX rather than require one —
  creating 47 files would rebuild the hand-maintained list the dispatch manifest
  died of. Those projects release by tag only, which is fine.
- **The 7 `app_name` values that do not resolve** (`unity-rareicon.mdx` →
  `rareicon`, `unreal-chuck-beta.mdx` → `chuck`, `godot-friendslop.mdx` →
  `friendslop`, …). These block the MDX route for those projects and must be
  fixed before Change 3 ships, or explicitly excluded.
- **The 7 already-drifted MDX versions.** Six are MDX-ahead with no tag, so the
  MDX trigger would immediately try to release them the moment it ships. Decide
  before Change 3: fix them in a one-time sync pass, or accept six releases
  firing at once.

## Verification

Whatever is built must be provable without pushing a tag:

- `verify-tag.mjs` has a test file (`verify-tag.test.mjs`) — the direction check
  belongs there: below, equal, above, and a malformed version.
- `audit.mjs` runs as `release-tools:lint` in `moon ci`. The "every version file
  a project carries agrees" rule belongs there, so a mismatch is caught at PR
  time rather than at tag time.
- `release.yml` has `workflow_dispatch` with a `tag` input for re-verifying an
  existing tag without pushing one.
- The MDX trigger's comparison logic goes in a `.mjs` with its own test file, so
  "MDX ahead of tag → release" and "MDX equal or below → no-op" are provable
  without pushing anything. The cases in the convergence table above are the
  fixtures: six MDX-ahead, one manifest-ahead, and a project whose `app_name`
  does not resolve.
