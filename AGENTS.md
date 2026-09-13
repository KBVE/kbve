# Worktree Workflow

All work must happen in isolated git worktrees branched from `dev`. Never commit directly to `dev` or `main`.

## Flow

1. **Create worktree** using `kbve.sh` (preferred — handles env setup automatically). Run it from the main repo:

    ```bash
    ./kbve.sh -worktree <task-name>          # bases off dev
    ./kbve.sh -worktree <task-name> <base>   # bases off another branch
    ```

    It fetches `origin/<base>`, creates the worktree at `<repo-dir>-<task-name>`
    (a sibling of the main repo — `../kbve-<task-name>`) on a new branch
    `trunk/<task-name>-<unix-seconds>`, copies `.env`, and runs `pnpm install`.
    The task name is lowercased and stripped to `[a-z0-9-]`, so pass it already
    in that shape or the directory will not be the one you expect.

    Manual alternative — the branch must be cut from the **remote** ref, not a
    possibly-stale local one, and `git worktree add` takes `-b <branch>` before
    the start point:

    ```bash
    git fetch origin dev
    GIT_LFS_SKIP_SMUDGE=1 git worktree add ../kbve-<task-name> \
      -b trunk/<task-name>-$(date +%s) origin/dev
    ```

    `GIT_LFS_SKIP_SMUDGE=1` is not optional — see [Worktrees and LFS](#worktrees-and-lfs).

2. **No per-worktree setup.** moon finds the workspace root by walking up to `.moon/`, so a worktree needs no environment telling it where it is, and task outputs are shared across worktrees through the CAS (`cache.unstable_sharedWorktreeCache`). A new worktree does not start cold.

3. **Install dependencies** (skipped if `kbve.sh -worktree` was used):

    ```bash
    cd ../kbve-<task-name> && pnpm install
    ```

4. **Do work** — make changes, test, iterate.

5. **Commit** using conventional commits (`feat`, `fix`, `refactor`, `chore`, etc.):

    ```bash
    git add <files>
    git commit -m "feat(scope): short description"
    ```

6. **Push and PR to `dev`**:

    ```bash
    git push -u origin trunk/<task-name>-<unix-seconds>
    gh pr create --base dev --title "feat(scope): short description" --body "..."
    ```

    Validate the title before opening the PR — CI rejects it otherwise:

    ```bash
    node tools/commit/validate.mjs --title "feat(scope): short description"
    ```

7. **After merge**, clean up:
    ```bash
    ./kbve.sh -worktree-rm <task-name>
    ```
    Or manually:
    ```bash
    git worktree remove ../kbve-<task-name>
    git branch -d trunk/<task-name>-<unix-seconds>
    ```

## Rules

- Branch naming: `trunk/<task-name>-<unix-seconds>` (what `kbve.sh` generates)
- Worktree path: `<repo-dir>-<task-name>`, i.e. `../kbve-<task-name>` (adjacent to main repo)
- Always `pnpm install` in new worktrees
- No `.env.local` is written, and none is needed — moon walks up to `.moon/`
- Worktrees start with LFS assets as pointer stubs. Hydrate the one game you are touching with `LFS_GAME=<game> moon run lfs-tools:hydrate` — see [Worktrees and LFS](#worktrees-and-lfs)
- Run tasks with `moon run <project>:<task>` from anywhere in the worktree. `./kbve.sh -moon` is the same thing through the repo shell.
- PRs target `dev`, never `main`
- Keep PR descriptions concise
- **No attribution of any kind.** Commits carry no `Co-Authored-By:` trailer and
  no `Generated with` line; PR titles, bodies and comments carry no
  "Generated with Claude Code" footer and no `claude.com` / `claude.ai` link.
  This applies to every agent and every tool default — strip it before
  committing or posting rather than letting a template add it.

---

# Atomic Branches

For small, self-contained changes (docs, config, single-file fixes). Atoms use isolated git worktrees just like trunk branches.

## Flow

1. **Create atomic worktree** using `kbve.sh` (preferred):

    ```bash
    ./kbve.sh -atomic <description>
    ```

    This creates a worktree at `../kbve-atom-<description>` on branch
    `atom-<MMDDHHMM>-<description>` cut from `origin/dev`, copies `.env`, and
    runs `pnpm install`. It refuses up front when the branch already exists on
    the remote or the name exceeds the 50-character CI limit. No `.env.local` is
    written.

    Manual alternative:

    ```bash
    git fetch origin dev
    GIT_LFS_SKIP_SMUDGE=1 git worktree add ../kbve-atom-<description> \
      -b atom-$(date +%m%d%H%M)-<description> origin/dev
    ```

    `GIT_LFS_SKIP_SMUDGE=1` is not optional — see [Worktrees and LFS](#worktrees-and-lfs).

2. **Do work** in the worktree, commit with conventional commits:

    ```bash
    cd ../kbve-atom-<description>
    git add <files>
    git commit -m "fix(scope): short description"
    ```

3. **Push** — `ci-atom.yml` auto-creates a PR to `dev`:

    ```bash
    git push -u origin atom-<MMDDHHMM>-<description>
    ```

    `ci-atom.yml` runs lint + test, then leaves the PR open for a human to review and merge. Atomics do **not** auto-merge — the workflow only auto-creates the PR; merging into `dev` is a manual step.

4. **Cleanup** after merge:
    ```bash
    ./kbve.sh -worktree-rm atom-<description>
    ```

## Rules

- **Branch naming:** `atom-<MMDDHHMM>-<description>` — alphanumeric + hyphens only, max 50 chars
- **Worktree path:** `../kbve-atom-<description>` (adjacent to main repo)
- **Reserved names:** `atom-main`, `atom-dev`, `atom-master` are blocked
- **Authorization:** Only users in the `AUTHORIZED_USERS` list in `ci-atom.yml` may run the atomic workflow (push `atom-*` branches and get a PR auto-created). It does not grant auto-merge — a human still reviews and merges the PR.
- **Tests:** `moon run ':lint' --affected` and `moon run ':test' --affected` run against `dev` before merge
- PRs target `dev`, never `main`
- Same attribution rule as trunk worktrees: no `Co-Authored-By:` trailers, no
  "Generated with Claude Code" footers, no `claude.com` / `claude.ai` links in
  commits, PR bodies or PR comments

## When to Use Trunk Worktrees Instead

- Multi-commit features requiring iterative testing
- Changes spanning many files across multiple projects

---

# Worktrees and LFS

Every worktree is created with `GIT_LFS_SKIP_SMUDGE=1`, by `kbve.sh` and by the
manual commands above. This is deliberate, and it is the only form that works.

## Why the smudge is skipped

`git worktree add` runs the LFS smudge filter over every pointer in the tree.
Two things go wrong when it does:

- **One bad pointer kills the whole checkout.** A blob missing from the game's
  Forgejo repo (an oversized `.umap` under `apps/chuckrpg`, historically) 404s,
  the filter is `required = true`, and `worktree add` aborts having created
  nothing. The failure has nothing to do with the branch being checked out.
- **It pulls gigabytes nobody asked for.** The monorepo tracks eight games'
  binaries. A docs worktree does not need Unreal assets, and the objects land
  in the shared `.git/lfs/objects` store, which is how that store reaches
  double-digit gigabytes.

So assets arrive as ~130-byte pointer stubs. That is the expected state of a
fresh worktree.

## Hydrating

Pull the one game you are actually touching:

```bash
LFS_GAME=chuck moon run lfs-tools:hydrate
```

Equivalently, `./kbve.sh -lfs chuck hydrate`. Game names come from
`tools/lfs/remotes.tsv`; `./kbve.sh -lfs` with no game lists them.

`hydrate` scopes the pull to the game's path prefix _and_ routes it to the
game's own endpoint, then fails if any pointer under the prefix is still a stub.

**Do not use a bare `git lfs pull`.** Stock git-lfs reads `lfs.url` from the
repository-root `.lfsconfig` only, which names `KBVE/rareicon` for the entire
monorepo. A bare pull therefore asks the rareicon endpoint for every game's
blobs — slow, and wrong for anything that is not rareicon. The per-project
`.lfsconfig` files document intent and route no traffic.

CI does the same thing through `tools/lfs/ensure.sh` (`LFS_REMOTE=<game>`),
which adds Forgejo auth preflight and retries.

## A pointer stub is not a corrupt asset

An unhydrated pointer reaches a consumer as garbage, and every engine reports
it as something else: Godot raises `ERR_FILE_CORRUPT` or dies on a signal,
Unreal fails to load the package, an export "succeeds" and ships a broken
build. Before debugging any asset-shaped failure in a worktree, check whether
the file is a stub:

```bash
head -c 60 <path>   # "version https://git-lfs..." means it was never hydrated
```

## Reclaiming disk

Hydrated objects accumulate in `.git/lfs/objects` in the main repo and are
shared by every worktree — they are never freed by removing a worktree. To
reclaim:

```bash
git lfs prune
```

---

# Live references

The site at <https://kbve.com> publishes this repository's own generated state.
When a commit message, PR description, issue comment or doc needs to point at
something, link the live page — never an AI-tool URL, and never a raw path in
`main` that a reader cannot open.

| what                          | live page                                                            |
| ----------------------------- | -------------------------------------------------------------------- |
| monorepo project graph        | <https://kbve.com/graph/> (searchable list: `/graph/list`)           |
| graph dashboard (nightly)     | <https://kbve.com/dashboard/graph>                                   |
| dependency + advisory state   | <https://kbve.com/dashboard/deps>, `/dashboard/security`             |
| CI health, activity, releases | `/dashboard/ci-health`, `/dashboard/activity`, `/dashboard/releases` |
| coverage / LOC report         | <https://kbve.com/dashboard/report>                                  |
| kanban                        | <https://kbve.com/dashboard/kanban>                                  |
| dev journal                   | <https://kbve.com/journal/MM-DD>                                     |
| a crate's release doc         | `https://kbve.com/project/<name>-crate`                              |

Every one of those is regenerated by `ci-daily-content.yml`, so a link stays
correct as the tree moves; a path does not.

---

# Releases are git tags

A release is a tag, `<moon project id>@<semver>`:

```bash
git tag axum-kbve@1.0.297
git push origin axum-kbve@1.0.297
```

`release.yml` resolves the tag against the project graph, checks the version
against the project's own manifest, drafts a GitHub release with notes built
from the commits that actually touched that project since its own previous tag,
and hands it to the publisher for whichever lane the project opts into. Nothing
else triggers a publish.

- The version lives in the project's own manifest — `Cargo.toml`,
  `package.json`, `pyproject.toml`, or `version.toml` for the image-only
  projects that have none of those. **Bump it, commit it, then tag.** A tag
  whose version disagrees with the manifest is rejected rather than published.
- The lane is a tag in the project's `moon.yml`. It is separate from the
  toolchain tag, because what a project is built with and what publishing it
  means are different questions — 26 applications here are written in rust and
  must never reach crates.io.

    | lane tag                                   | what a tag does                                                   |
    | ------------------------------------------ | ----------------------------------------------------------------- |
    | `crates`                                   | publishes to crates.io                                            |
    | `npm`                                      | publishes to npmjs                                                |
    | `pypi`                                     | publishes to PyPI                                                 |
    | `docker`                                   | builds and pushes the image, then pins it into the kube manifests |
    | `web-game`                                 | builds the browser bundle and pushes it to itch                   |
    | `godot` `unity` `unreal-game` `ue5-server` | runs that engine's build and ships the artifact                   |
    | `desktop`                                  | builds the Tauri app for its declared platforms                   |

- A project in no lane cannot be released, and tagging it fails loudly rather
  than doing nothing.
- Anything the release needs beyond the version is the project's own `env`, not
  a list kept elsewhere: `KUBE_DEPLOYMENT_YAMLS` (which kube manifests the image
  tag is pinned into — **without this a release reaches the registry and never
  reaches the cluster**), `CI_RUNNER` (when the default two-core hosted runner
  is not enough), `ENGINE_CONFIG`, and the `ITCH_*` / `STEAM_APPS` /
  `MODRINTH_*` / `PUBLISHES_FACTORIO_MODS` publish targets.
- A deployment pin belongs on the project that **builds** the image, which is
  not always the one whose source changes: `axum-kbve` builds the image
  `astro-kbve`'s content ships in.

Games ship to itch, not into the site. `isometric` used to rebuild its wasm
bundle on every push to main and commit the result into
`astro-kbve/public/isometric`; a wasm build is a nightly toolchain rebuilding
std with atomics, which is not something to do for a release nobody asked for.
It is a `bevy-game` tag now. The assets already committed under
`public/isometric` are left alone — the site keeps serving them until someone
decides otherwise.

There is no dispatch manifest and no MDX version pipeline. Both are gone.
`.github/ci-dispatch-manifest.json`, `utils-file-alterations.yml` and the
`ci-manifest-*` workflows tried to infer release intent from which files a
commit touched, using a hand-maintained path list that fell out of step with
the tree; a tag states the intent once. MDX `version:` frontmatter remains as
display data for the site and is no longer a lever.

Adding a project to a lane is one line in its own `moon.yml`, not an entry in a
list kept somewhere else.

---

# Running tasks

Run tasks through moon (`moon run <project>:<task>`, `moon check`, `moon ci`)
rather than the underlying tool directly. The task config carries the inputs,
outputs and dependencies that make a run cacheable and correct.

- `moon query projects` and `moon query tasks` answer "what exists" as JSON;
  `moon project <id>` and `moon task <target>` explain one of them. Prefer these
  over reading config files by hand.
- A task id spells a colon as a hyphen: `astro-kbve:sync-itemdb`, not
  `sync:itemdb`.
- `moon project-graph` and `moon task-graph` open the graphs. `moon clean`
  clears the cache.
- Affected runs take `--affected --base <ref> --head <ref>`.
- **Never guess CLI flags — check `--help` first.** `moon ci` has no `--query`;
  a task opts out of CI with `runInCI: false` in its own moon.yml.

## Where configuration lives

- `.moon/workspace.yml` — the project graph. Everything outside `crates/` is
  named explicitly; read the comment there before adding a glob.
- `.moon/toolchains.yml` — node, pnpm, rust and the typescript/javascript layers.
- `.moon/tasks/*.yml` — the presets. A file's `inheritedBy` is either a tag
  (`astro`, `docker`, `npm`, `playwright`, `vite`, `vitest`, `eslint`, `tauri`,
  `lfs`, `uv`) or a toolchain (`rust`, `node`). Most projects need no tasks of
  their own; they declare tags and inherit.
- `<project>/moon.yml` — only what the tags do not already provide.

## Adding a project

1. Give it a `moon.yml` with `layer`, `language` and its tags.
2. Add it to `projects.sources` in `.moon/workspace.yml` — a project outside
   `crates/` is not in the graph until it is named there.
3. Write tasks only where the preset is wrong for it.

## Common pitfalls

- **Inherited tasks merge, they do not override.** args, deps, inputs and
  outputs from a preset are appended to the project's own. To replace rather
  than extend, set `options.mergeOutputs: 'replace'` (and the equivalent for the
  other fields).
- **Two presets that define the same task id will merge their commands into
  nonsense.** This is why a rust project with a vitest config does not get the
  `vitest` tag, and why rust and python projects never get `eslint` — `test` and
  `lint` already belong to cargo and to ruff.
- **A glob in `projects.sources` registers every matching directory**, with or
  without a moon.yml. `apps/` and `packages/` have repeated basenames (`kbve`,
  `relay`, `server`, `web`) and globbing them breaks the graph outright.

---

# Commit messages

Conventional commits, enforced by the `commit-msg` hook and again on the pull
request title in CI (a title is composed in the browser where no hook runs, and
a squash merge makes it the commit message).

```
type(scope): subject
```

- **Types** and **scopes** live in `tools/commit/scopes.lock.json`, generated
  from the project graph by `moon run commit:sync`. Run that after adding or
  renaming a project; `moon run commit:lint` fails when the lock is behind, so
  CI catches it rather than a contributor meeting it as a rejected commit.
- A scope is normally a moon project id. Repository-wide and domain scopes
  (`ci`, `kube`, `content`, `agones`…) are listed in `tools/commit/scopes.yml`.
- A change spanning a few projects may list them: `fix(reel,discordsh-bot):`.
- This is not decoration. `tools/release/notes.mjs` reads the type and scope out
  of the commits a release contains, so an unconventional message lands under
  the wrong heading in someone's release notes rather than failing anything.
- Validate a pull request title before opening the PR, since the hook does not
  see it: `node tools/commit/validate.mjs --title "<title>"`.

## No attribution trailers or links

A commit message ends at its body. Nothing appends a `Co-Authored-By:` trailer,
a "Generated with" line, or a link to `claude.com` / `claude.ai` — not in
commits, not in pull request titles or descriptions, not in review comments
posted on a PR. Release notes are generated from these messages, so a trailer
added by a tool default ends up published; remove it before committing or
posting instead of after.

---

# itemdb / npcdb / mapdb / questdb MDX — content, not versioned

Different rule for content collections under `docs/{itemdb,npcdb,mapdb,questdb}/*.mdx`:

- These have **no** `version:` field. They're data, not packages.
- Edit MDX → run the matching codegen target:
    - `moon run astro-kbve:sync-itemdb`
    - `moon run astro-kbve:sync-npcdb`
    - `moon run astro-kbve:sync-mapdb`
    - `moon run astro-kbve:sync-questdb`
- Commit the MDX **and** any artifacts the sync target wrote (JSON / binpb under `astro-kbve/public/data/`, Generated C# under `apps/rareicon/.../Generated/`).
- ❌ Never hand-edit those generated artifacts. The MDX is the source of truth; the sync target is the only writer.

# Unreal C++ — validate edits with kbve-unreal-check

After editing any C++ file under `packages/unreal/` or `apps/rentearth/unreal-rentearth/Source/`, validate it in seconds instead of running a full UBT build:

```
cd packages/python/kbve
uv run kbve-unreal-check <absolute-or-relative-file-path>
```

- Works on `.cpp` and `.h` (headers are checked through a sibling source file from the same module).
- Exit 0 = clean, 1 = compile errors (printed as `file:line:col: error: ...`), 2 = file not in the compile database.
- On exit 2 (new file, or flags drifted), regenerate the database first: `uv run kbve-unreal-clangd` (or `moon run unreal-rentearth:clangd-db`). Takes ~10 s.
- The database lives at `apps/rentearth/unreal-rentearth/compile_commands.json` (gitignored) and is pointed to by the committed root `.clangd`, which also powers clangd IDE support.

---
