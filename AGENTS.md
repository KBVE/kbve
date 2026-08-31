# Worktree Workflow

All work must happen in isolated git worktrees branched from `dev`. Never commit directly to `dev` or `main`.

## Flow

1. **Create worktree** using `kbve.sh` (preferred — handles env setup automatically):

    ```bash
    ./kbve.sh -worktree <task-name>
    ```

    This creates the worktree, copies `.env`, and runs `pnpm install`.

    Manual alternative:

    ```bash
    git fetch origin dev
    git worktree add ../kbve-<task-name> dev -b trunk/<task-name>-<MM-DD-YYYY>
    ```

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
    git push -u origin trunk/<task-name>-<MM-DD-YYYY>
    gh pr create --base dev --title "feat(scope): short description" --body "..."
    ```

7. **After merge**, clean up:
    ```bash
    ./kbve.sh -worktree-rm <task-name>
    ```
    Or manually:
    ```bash
    git worktree remove ../kbve-<task-name>
    git branch -d trunk/<task-name>-<MM-DD-YYYY>
    ```

## Rules

- Branch naming: `trunk/<task-name>-<MM-DD-YYYY>`
- Worktree path: `../kbve-<task-name>` (adjacent to main repo)
- Always `pnpm install` in new worktrees
- Run tasks with `moon run <project>:<task>` from anywhere in the worktree. `./kbve.sh -moon` is the same thing through the repo shell.
- PRs target `dev`, never `main`
- No co-authoring lines in commits
- Keep PR descriptions concise

---

# Atomic Branches

For small, self-contained changes (docs, config, single-file fixes). Atoms use isolated git worktrees just like trunk branches.

## Flow

1. **Create atomic worktree** using `kbve.sh` (preferred):

    ```bash
    ./kbve.sh -atomic <description>
    ```

    This creates a worktree at `../kbve-atom-<description>`, generates `.env.local`, copies `.env`, and runs `pnpm install`.

    Manual alternative:

    ```bash
    git fetch origin dev
    git worktree add ../kbve-atom-<description> -b atom-<MMDDHHMM>-<description> origin/dev
    ```

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
- No co-authoring lines in commits

## When to Use Trunk Worktrees Instead

- Multi-commit features requiring iterative testing
- Changes spanning many files across multiple projects

---

# MDX is the version source — never hand-edit downstream files

Every project with a `pipeline:` field in its `apps/kbve/astro-kbve/src/content/docs/project/*.mdx` frontmatter follows the same contract:

- `pipeline: docker` — `mc`, `mc-lobby`, `mc-velocity`, `kilobase`, `api`, `arc-runner`, `chuckrpg`, `discordsh`, `edge`, `herbmail`, `irc-gateway`, `iot-edge-worker`, `kubectl`, `memes`, `rareicon`, `rows`, `steamcmd-ubuntu`, etc.
- `pipeline: crates` — `bevy_inventory`, `bevy_kbve_net`, `bevy_items`, `bevy_tasker`, `soul`, `uniti`, `khashvault`, `holy`, `kbve`, `jedi`, etc.
- `pipeline: npm` — `@kbve/*` packages
- `pipeline: python` — `python-kbve` (PyPI: `kbve`)
- `pipeline: ue5_server`, `pipeline: unity`, `pipeline: unreal` — game engine builds

Same rules apply across all of them:

- ✅ Bump **only** the mdx frontmatter `version: "x.y.z"` to ship a new release.
- ❌ Never edit the file pointed at by `version_toml:` (`apps/<app>/version.toml`, `packages/.../version.toml`) — CI's post-publish PR owns it.
- ❌ Never edit the file pointed at by `version_source:` (`Cargo.toml`, `package.json`, `pyproject.toml`) — same.
- ❌ Never edit `apps/kube/.../<app>-deployment.yaml` `image:` tags — Argo + post-publish own those too.

Dispatch logic: CI compares mdx `version:` against `version_toml`; **equal → skip build entirely**. Pre-bumping `version.toml` (or `Cargo.toml`, etc.) silently breaks the pipeline because the dispatcher thinks the version already shipped.

Look-ups before editing: `git log -- <project>.mdx` and confirm the bot account (`kbve-bot` / CI commits) is the one that touches `version.toml`. If a human commit shows up there, it's a mistake.

---

# itemdb / npcdb / mapdb / questdb MDX — content, not versioned

Different rule for content collections under `apps/kbve/astro-kbve/src/content/docs/{itemdb,npcdb,mapdb,questdb}/*.mdx`:

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
