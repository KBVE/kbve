# kbve.nx Daily Content Router → Builder

**Date:** 2026-07-18
**Status:** Approved (pending spec review)
**Owner:** kbve

## Problem

Internal MDX content files under `apps/kbve/astro-kbve/src/content/docs/` need scheduled, automated edits. First case: the daily **journal** (`journal/MM-DD.mdx`) needs a fresh year-block scaffold each night. Rather than a one-off journal workflow, build a reusable **router → builder** system in the `kbve` Python package so future content jobs (security dashboard, nx graph, others) register as routes and fan out through one daily pipeline.

## Goals

- A route registry in `kbve.nx` where each content job declares `plan` (detect pending work, no writes) + `build` (apply edits, report changes).
- A **router** that, for a cadence (e.g. `daily`), returns the routes needing work as a GitHub Actions matrix.
- A **builder** that executes a single route independently and reports changed files.
- Two CI jobs — **router → builder** — where builder **fans out per route** (independent, parallel, isolated checkout/branch/PR), so heavier jobs slot in later without new plumbing.
- Journal is the first and only route implemented now. Security/graph are designed-for, not built.

## Non-goals

- Migrating existing `scripts/nx-security-to-mdx.py` / `nx-graph-to-mdx.py` into routes (future).
- Auto-merge. PRs stay open for human review/fill.
- Writing real journal prose (route inserts an empty scaffold block only).

## Context / constraints

- Package: `packages/python/kbve/kbve/`, nx project `python-kbve`, `uv` + hatchling, Python `>=3.12`.
- Existing `kbve/nx/` holds `render.py`, `security.py`, `graph.py`, `cli.py` (argparse `*_main(argv)->int` + `[project.scripts]`). Extend it.
- `kbve/mdx/renderer.py` (`MdxWriter`) = full-generate primitive. `kbve/seo/_pages.py` = frontmatter reader + `find_content_dir()` (resolves `apps/kbve/astro-kbve/src/content/docs`).
- `vault/` is a symlink → `apps/kbve/astro-kbve/src/content`; canonical git-tracked journal path is `apps/kbve/astro-kbve/src/content/docs/journal/MM-DD.mdx`. All 367 day files exist (incl. `02-29`).
- **Stdlib only** — no new deps. Journal edits are surgical regex, no YAML re-dump.
- CI PR convention (from `utils-update-version-toml.yml`): checkout `ref: dev`, edit, `git diff --cached --quiet` guard, branch `auto/...`, commit `[skip ci]`, `gh pr create --base dev --label auto-pr`, no auto-merge.

## Architecture

### Python — `kbve/nx/`

**`router.py`** — registry + selection.
```
@dataclass(frozen=True)
class Route:
    name: str
    cadence: str            # "daily" | "on-demand" | ...
    plan: Callable[[BuildContext], PlanResult]
    build: Callable[[BuildContext], BuildResult]

ROUTES: dict[str, Route] = {}
def route(name, cadence): ...        # decorator registering a Route
def select(cadence) -> list[Route]:  # routes matching cadence
def get(name) -> Route:
```

**`builder.py`** — orchestration.
```
@dataclass
class BuildContext:
    content_root: Path      # resolved via find_content_dir()
    date: date | None       # override for tests; else computed per route
    dry_run: bool
    inputs: dict            # future routes' external data (nx graph json, audit payloads)

@dataclass
class PlanResult:  route: str; needs_work: bool; reason: str; targets: list[str]
@dataclass
class BuildResult: route: str; changed: list[str]; skipped: bool; note: str

class Builder:
    def plan_all(self, cadence) -> list[PlanResult]      # routes needing work
    def build_one(self, route_name) -> BuildResult
```

**`document.py`** — `MdxDocument`, surgical format-preserving editor for edit-in-place routes.
```
class MdxDocument:
    @classmethod def load(cls, path) -> MdxDocument
    text: str
    def frontmatter_scalar(self, key) -> str | None          # regex read of `key: value`
    def set_frontmatter_year(self, key, year) -> bool        # bump YYYY in `key: YYYY-...`
    def replace(self, pattern, repl, count=1) -> int         # anchored regex replace
    def insert_before(self, anchor_pattern, block) -> bool   # insert block before first match
    def contains(self, needle) -> bool
    @property def dirty -> bool
    def save(self) -> None
```
No full YAML parse/redump — keeps diffs minimal on hand-authored bento frontmatter.

**`routes/journal.py`** — the `journal` route (`cadence="daily"`).
- Target date: `--date MM-DD`/`--year YYYY` override in `ctx`, else **tomorrow in `America/New_York`** via `zoneinfo` (format ET-now → plain-date +1 day; no TZ math in the add → DST-safe for date purposes).
- File: `content_root/journal/MM-DD.mdx`. Missing → `PlanResult(needs_work=False, reason="file absent")`.
- **plan:** `needs_work = not doc.contains('id="<year>"')`.
- **build (idempotent):** if block present → `skipped`. Else three surgical edits:
  1. `set_frontmatter_year("date", year)` → `date: <year>-MM-DD 12:00:00`.
  2. `replace(r"href: '#\d{4}'", f"href: '#{year}'")` → the "Read the log" CTA anchor.
  3. `insert_before(r'<BentoProse id="', BLOCK)` where BLOCK =
     ```
     <BentoProse id="<year>" heading="<year>">

     - [ ]

     </BentoProse>

     ```
  - `save()`, return changed `[relpath]`.

**`cli.py`** (extend):
- `router_main(argv)`: `kbve-nx-router --cadence daily [--json]` → always prints valid JSON `{"include":[{"route":"journal"}, ...]}` (empty `include: []` when nothing pending). Writes two `GITHUB_OUTPUT` keys when `$GITHUB_OUTPUT` is set: `matrix=<json>` and `has_work=true|false`. Router runs each route's `plan()` (read-only) to decide inclusion — never writes.
- `build_main(argv)`: `kbve-nx-build <route> [--dry-run] [--date MM-DD --year YYYY]` → runs `Builder.build_one`, prints changed paths (one per line), exit 0 (changed or skipped), non-zero on error.

**`pyproject.toml`** `[project.scripts]`: add
```
kbve-nx-router = "kbve.nx.cli:router_main"
kbve-nx-build  = "kbve.nx.cli:build_main"
```
**`project.json`** targets (mirror `proto`): `router` → `uv run kbve-nx-router ...`, `build` → `uv run kbve-nx-build ...`.

### CI — `.github/workflows/ci-daily-content.yml` (one file, two jobs)

```
on:
  schedule: [{ cron: '0 1 * * *' }]    # 8pm EST / 9pm EDT
  workflow_dispatch:
permissions: { contents: write, pull-requests: write }
concurrency: { group: daily-content, cancel-in-progress: false }

jobs:
  router:
    outputs: { matrix, has_work }
    steps:
      - checkout ref: dev
      - uv setup (mirror python-test-package.yml)
      - id: plan: kbve-nx-router --cadence daily --json → GITHUB_OUTPUT (matrix, has_work)

  builder:
    needs: router
    if: needs.router.outputs.has_work == 'true'
    strategy:
      fail-fast: false
      matrix: ${{ fromJson(needs.router.outputs.matrix) }}   # independent fan-out
    steps:
      - checkout ref: dev
      - uv setup
      - kbve-nx-build ${{ matrix.route }}
      - git add content dir; git diff --cached --quiet && exit 0   # guard
      - branch auto/daily-${{ matrix.route }}-<run-date YYYY-MM-DD>; commit '[skip ci]'; push
      - gh pr create --base dev --label auto-pr    # per-route PR, no auto-merge
```

**CI setup detail:** mirror `.github/workflows/python-test-package.yml` for the uv/python environment (`astral-sh/setup-uv` + `uv sync` in `packages/python/kbve`, then `uv run kbve-nx-*`), or the equivalent `@nxlv/python` nx target. Branch date uses the workflow **run date** (UTC `YYYY-MM-DD`) for uniqueness, independent of the journal target date. `git config user.name/email` = `github-actions[bot]` as in `utils-update-version-toml.yml`.

Second workflow (future): security/graph become on-demand callers or additional cadences reusing the same router/builder — no changes here.

## Testing (TDD)

- `tests/test_nx_router.py`: register a dummy route; `select("daily")` returns it; `get` / unknown-name error.
- `tests/test_nx_document.py`: `set_frontmatter_year`, `replace`, `insert_before`, `contains`, dirty/save on a temp mdx.
- `tests/test_nx_journal.py`: copy `07-19.mdx` fixture → build with `year=2026` → assert `date: 2026-`, `href: '#2026'`, new `<BentoProse id="2026"` inserted above `id="2025"`, block body `- [ ]`. Re-run → `skipped`, no diff (idempotent). `plan` returns `needs_work=False` after build.

## Verification before handoff

Run `kbve-nx-build journal --date 07-19 --year 2026 --dry-run` against a temp copy; confirm output matches the committed 07-18 structure. Run `kbve-nx-router --cadence daily --json`; confirm matrix shape parses as GH Actions matrix.

## Rollout

1. Build Python router/builder/document/journal + tests (TDD).
2. Wire scripts + nx targets.
3. Add `ci-daily-content.yml`.
4. `workflow_dispatch` a manual run → verify a journal PR to dev.
