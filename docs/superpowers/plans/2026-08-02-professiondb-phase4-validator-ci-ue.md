# professiondb Phase 4 (FINAL) — Validator Hard-Fail + Weekly Router Audit + UE Forward-Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make professiondb the enforced unified source of truth — in ONE PR: (A1) content-derived `content_version`; (A2) single-source + graph-integrity checks; (A3) flip the xref validator to hard-fail with exit propagation; (A4) register a `professiondb` route in the existing `kbve-nx-router` on **weekly** cadence so the scheduled daily-content builder is the drift/integrity audit (no new bespoke workflow); (B) add `ProfessionActionRef` to `FKBVEWorldObjectDef` + parse, KEEPING `HarvestTimeMs`.

**Architecture:** MDX → `gen-professiondb-data.mjs` (emits `professiondb-data.json`/`.binpb`/`professiondb-runtime.json`, syncs Unity StreamingAssets) → calls `generateXref()` from `gen-professiondb-xref.mjs` (emits `xref-index.json` joining itemdb+professiondb+mapdb). The xref stage is the only place all three DBs load together — making IT throw fails the whole `sync:professiondb` nx target. The gate runs wherever `sync:professiondb` runs; the scheduled home is a `kbve-nx-router` route (weekly cron `0 2 * * 1` in `ci-daily-content.yml`) whose `build()` runs `sync:professiondb` and lets the hard-fail PROPAGATE (fails the weekly job) — and whose regen drift is auto-PR'd like every other route. UE (`KBVEMapDB`) hand-parses `mapdb-data.json`; one struct field + one parse line is a non-destructive forward reference.

**Tech Stack:** Node 24 ESM (`node:crypto`), nx `run-commands`, Python `kbve-nx-router` (routes = `@route` dataclass registry + `plan`/`build`), pytest, Unreal C++ — static verification only, no UE toolchain here.

## Global Constraints

- Work only in worktree `/Users/alappatel/Documents/GitHub/kbve-professiondb-phase4-validator`, branch `trunk/professiondb-phase4-validator-1785669552`. Never the main tree. Absolute paths.
- DROP ALL code comments in authored/edited **code** (JS + C++). Python: match the surrounding module style (existing routes carry docstrings/comments — mirror the neighbor, do not strip theirs, but add no gratuitous inline comments).
- Commits: no `Co-Authored-By`, no "Generated with Claude".
- Build/data only via nx + `gen-*.mjs`; MDX is source of truth; never hand-edit generated JSON (except the temporary, reverted fault-injection in Task 6).
- `content_version` MUST be a deterministic pure function of the DATA — no `Date.now()`/`new Date()`/`Math.random()`.

## Verified facts (VERIFIED read-only — re-confirm line numbers before editing)

- `gen-professiondb-xref.mjs`: `CONTENT_VERSION='phase1'` ~L13; written as `content_version` ~L89; `writeFileSync(outPath, JSON.stringify(index,null,2))` ~L97; warn-only tail ~L102-106; standalone guard ~L109; `export function main()` ~L15. Validates 3 edge classes into `warnings[]`; NO process.exit/throw, NO graph-integrity, NO single-source-invariant.
- `gen-professiondb-data.mjs`: `generateXref()` called ~L243 inside synchronous `main()`; bare `main();` ~L246.
- `project.json` `sync:professiondb` ~L395-418, command `node packages/data/codegen/gen-professiondb-data.mjs`, outputs include `xref-index.json` + Unity `professiondb-runtime.json`.
- **Current data passes hard-fail (VERIFIED 0 ERRORS):** 8 professions, 48 actions (gather=29/compress=19), 19 bidirectionally-linked nodes; 0 dangling item/node/action refs, 0 back-ref mismatches, 0 itemdb ownership fields.
- **False-positive trap (VERIFIED, CRITICAL):** itemdb has **24 recipes carrying `skill:"SKILLING_*"`** and **146 items carrying an `action` verb** — all LEGIT metadata. A naive `skilling`/`compress`/`action` substring/field check would flag ~170 items and break the gate. The single-source invariant is scoped to a fixed list of STRUCTURAL OWNERSHIP FIELDS only (never `action`, never `recipes[].skill`).
- **No unlock/prereq graph:** action fields are `ref,key,name,requiredLevel,xpReward,inputs,outputs,durationMs,resourceNodeRef,toolRefs`. No `unlocks`/`requires` edge → cycle detection N/A (do not fabricate an edge).
- **Router (VERIFIED):** `packages/python/kbve/kbve/nx/router.py` — `@dataclass Route{name,cadence,plan,build,needs}`, registered by the `@route(name, cadence, needs)` class decorator on a class with `plan(ctx)->PlanResult`/`build(ctx)->BuildResult`; `select(cadence)` filters. `builder.py`: `BuildContext{content_root,date,dry_run,inputs,public_dir,workdir,timestamp}`; `PlanResult(route,needs_work,reason,targets)`; `BuildResult(route,changed,skipped,note)`; `build_one(name)` returns `get(name).build(ctx)`; `repo_root_for(content_root)`. Route modules live in `packages/python/kbve/kbve/nx/routes/` and MUST be imported by `routes/__init__.py` so `@route` registers. Each route has a `tests/test_nx_<name>_route.py`.
- **Closest analog = `routes/proto.py`:** `@route("proto","daily",needs=("node","protoc"))`, `_run(cmd,cwd)` raises `ProtoAcquireError` on non-zero exit, `_detect_drift(repo_root)` git-diffs `packages/data/codegen/generated`. **proto CATCHES failure → `BuildResult(...,skipped=True,...)` (soft warn).** professiondb must do the OPPOSITE for the validator failure: let it PROPAGATE so `build_main` exits non-zero and the weekly job fails.
- **Scheduled workflow (VERIFIED):** `.github/workflows/ci-daily-content.yml` crons `0 1 * * *` (daily) + `0 2 * * 1` (weekly Mon); `router` job runs `uv run kbve-nx-router --cadence <daily|weekly> --json` → matrix `Build ${{ matrix.route }}` runs `kbve-nx-build <route>`; changed files are committed to a per-route branch + auto-PR'd (`[skip ci]`). NO workflow edit needed — a weekly route is picked up automatically.
- `KBVEMapTypes.h`: `FKBVEWorldObjectDef` with `FName HarvestYield;` (~L39), `int32 HarvestTimeMs = 0;` (~L48). `KBVEMapDatabase.cpp`: `LoadFromJson` ~L42-104; `FString Str;` ~L79; `TryGetStringField(TEXT("harvestYield"), Str)` ~L91; `TryGetNumberField(TEXT("harvestTimeMs"), Def.HarvestTimeMs)` ~L94. `mapdb-data.json` emits `professionActionRef` on 19 nodes (VERIFIED).

---

## Task 1: content_version → deterministic content hash (A1)

**Files:** Modify `packages/data/codegen/gen-professiondb-xref.mjs`.

**Scheme:** `content_version = sha256-<first 16 hex of SHA-256 over a canonicalized copy of the index payload excluding content_version>`. Canonical = recursively sort object keys + sort arrays-of-scalars. Pure over the three input JSONs, reproducible.

- [ ] **Step 1:** Re-read the script; confirm the import line, the `CONTENT_VERSION` literal, the `const index = {...}` block, `writeFileSync`.
- [ ] **Step 2:** Add `import { createHash } from 'node:crypto';` next to the `node:fs` import.
- [ ] **Step 3:** Delete `const CONTENT_VERSION = 'phase1';`.
- [ ] **Step 4:** Add the canonicalizer + hasher above `export function main()`:

```js
function canonicalize(value) {
	if (Array.isArray(value)) {
		const mapped = value.map(canonicalize);
		if (
			mapped.every((v) => typeof v === 'string' || typeof v === 'number')
		) {
			return [...mapped].sort((a, b) =>
				String(a).localeCompare(String(b)),
			);
		}
		return mapped;
	}
	if (value && typeof value === 'object') {
		const out = {};
		for (const k of Object.keys(value).sort())
			out[k] = canonicalize(value[k]);
		return out;
	}
	return value;
}

function contentVersion(payload) {
	const canonical = JSON.stringify(canonicalize(payload));
	const digest = createHash('sha256').update(canonical).digest('hex');
	return `sha256-${digest.slice(0, 16)}`;
}
```

- [ ] **Step 5:** Replace the `const index = {...}` block: build `payload` from the EXISTING emitted keys (keep their current names/shape so the file diff is limited to the version line), then `const index = { content_version: contentVersion(payload), ...payload };`.
- [ ] **Step 6:** Deterministic + change-sensitive test:

```bash
node -e '
const {createHash}=require("crypto");
function canon(v){if(Array.isArray(v)){const m=v.map(canon);return m.every(x=>typeof x==="string"||typeof x==="number")?[...m].sort((a,b)=>String(a).localeCompare(String(b))):m;}if(v&&typeof v==="object"){const o={};for(const k of Object.keys(v).sort())o[k]=canon(v[k]);return o;}return v;}
const cv=p=>"sha256-"+createHash("sha256").update(JSON.stringify(canon(p))).digest("hex").slice(0,16);
console.log("stable:", cv({a:[3,1,2],m:{y:1,x:2}})===cv({m:{x:2,y:1},a:[2,3,1]}));
console.log("sensitive:", cv({a:[3,1,2],m:{y:1,x:2}})!==cv({a:[3,1,9],m:{x:2,y:1}}));
'
```

Expected: `stable: true` / `sensitive: true`.

- [ ] **Step 7:** Commit: `git commit -am "professiondb: derive xref content_version from data hash"`.

## Task 2: single-source-invariant + graph-integrity checks (A2)

**Files:** Modify `packages/data/codegen/gen-professiondb-xref.mjs`. Introduce `errors[]` alongside `warnings[]`; capture the FULL itemdb objects.

- [ ] **Step 1:** Where itemdb is parsed, keep both raw + list: `const itemsRaw = JSON.parse(readFileSync(itemdbPath,'utf8')); const items = itemsRaw.items ?? [];` (keep the existing `ref→key` map build).
- [ ] **Step 2:** Add `const errors = [];` next to `const warnings = [];`.
- [ ] **Step 3:** Single-source invariant — STRUCTURAL OWNERSHIP FIELDS ONLY (never `action`/`recipes[].skill`):

```js
const OWNERSHIP_FIELDS = [
	'harvestYield',
	'harvestTimeMs',
	'resourceNodeRef',
	'professionActionRef',
	'gatherAction',
	'gatherActions',
	'compressAction',
	'compressActions',
	'skillingAction',
	'skillingActions',
	'durationMs',
];
const OWNERSHIP_TOP_KEYS = [
	'professions',
	'actions',
	'gatherActions',
	'compressActions',
	'skillingActions',
];
for (const k of OWNERSHIP_TOP_KEYS) {
	if (Object.prototype.hasOwnProperty.call(itemsRaw, k)) {
		errors.push(
			`single_source: itemdb-data.json owns top-level '${k}' — must live in professiondb`,
		);
	}
}
for (const it of items) {
	for (const f of OWNERSHIP_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(it, f)) {
			errors.push(
				`single_source: itemdb item '${it.ref}' carries profession field '${f}' — must live in professiondb`,
			);
		}
	}
}
```

- [ ] **Step 4:** Reclassify the existing three edge checks (unresolved item ref, missing `resourceNodeRef`, missing/mismatched `professionActionRef`) from `warnings.push` to `errors.push`.
- [ ] **Step 5:** Graph-integrity (back-ref consistency + orphan) after the objectDefs loop:

```js
for (const prof of professions) {
	for (const action of prof.actions ?? []) {
		if (!action.resourceNodeRef) continue;
		const node = objectDefByRef.get(action.resourceNodeRef);
		if (node && node.professionActionRef !== action.ref) {
			errors.push(
				`graph_integrity: action '${action.ref}' targets node '${action.resourceNodeRef}' but node back-refs '${node.professionActionRef ?? '(none)'}'`,
			);
		}
	}
}
for (const prof of professions) {
	for (const action of prof.actions ?? []) {
		const hasOutput = (action.outputs ?? []).length > 0;
		const hasNode = Boolean(action.resourceNodeRef);
		if (!hasOutput && !hasNode) {
			warnings.push(
				`orphan_action: action '${action.ref}' has neither outputs nor a resource node`,
			);
		}
	}
}
```

(Adapt `objectDefByRef`/`professions` to the real variable names.)

- [ ] **Step 6:** Prove 0 ERRORs on current data (VERIFIED clean):

```bash
node -e '
const fs=require("fs");const B="packages/data/codegen/generated/";
const itemsRaw=JSON.parse(fs.readFileSync(B+"itemdb-data.json","utf8"));const items=itemsRaw.items??[];
const professions=JSON.parse(fs.readFileSync(B+"professiondb-data.json","utf8")).professions??[];
const objectDefs=JSON.parse(fs.readFileSync(B+"mapdb-data.json","utf8")).objectDefs??[];
const keyByRef=new Map(items.map(i=>[i.ref,i.key]));const actByRef=new Map(),objByRef=new Map(objectDefs.map(o=>[o.ref,o]));const errors=[];
const OWN=["harvestYield","harvestTimeMs","resourceNodeRef","professionActionRef","gatherAction","gatherActions","compressAction","compressActions","skillingAction","skillingActions","durationMs"];
for(const k of ["professions","actions","gatherActions","compressActions","skillingActions"]) if(Object.prototype.hasOwnProperty.call(itemsRaw,k)) errors.push("top "+k);
for(const it of items) for(const f of OWN) if(Object.prototype.hasOwnProperty.call(it,f)) errors.push("item "+it.ref+" "+f);
for(const p of professions)for(const a of p.actions??[]){actByRef.set(a.ref,a.key);
 for(const o of a.outputs??[]) if(!keyByRef.has(o.itemRef)) errors.push("out "+o.itemRef);
 for(const i of a.inputs??[]) if(!keyByRef.has(i.itemRef)) errors.push("in "+i.itemRef);
 for(const t of a.toolRefs??[]) if(!keyByRef.has(t)) errors.push("tool "+t);
 if(a.resourceNodeRef){const n=objByRef.get(a.resourceNodeRef); if(!n)errors.push("node "+a.resourceNodeRef); else if(n.professionActionRef!==a.ref)errors.push("backref "+a.ref);}}
for(const o of objectDefs){if(!o.professionActionRef)continue; if(!actByRef.has(o.professionActionRef))errors.push("par "+o.ref);}
console.log("ERRORS:",errors.length); if(errors.length)console.log(errors.slice(0,20));
'
```

Expected: `ERRORS: 0`. If not 0, STOP and fix DATA via MDX+resync before flipping.

- [ ] **Step 7:** Commit: `git commit -am "professiondb: add single-source + graph-integrity checks to xref validator"`.

## Task 3: flip to hard-fail with exit propagation (A3)

**Files:** Modify `packages/data/codegen/gen-professiondb-xref.mjs`. Do NOT touch `gen-professiondb-data.mjs`.

- [ ] **Step 1:** Replace the warn-only tail so a broken graph never overwrites a good `xref-index.json`, then throws (propagates through the synchronous `generateXref()` → non-zero exit → nx target fails):

```js
if (warnings.length) {
	console.warn(`\n[xref warn] ${warnings.length} soft issue(s):`);
	for (const w of warnings) console.warn(`  ⚠ ${w}`);
}
if (errors.length) {
	console.error(`\n[xref FAIL] ${errors.length} error-class violation(s):`);
	for (const e of errors) console.error(`  ✗ ${e}`);
	throw new Error(
		`professiondb xref validation failed with ${errors.length} error(s)`,
	);
}
writeFileSync(outPath, JSON.stringify(index, null, 2));
console.log(`Wrote ${outPath}`);
```

Use `throw` (not `process.exit`). Do NOT add try/catch around `generateXref()` in `gen-professiondb-data.mjs`.

- [ ] **Step 2:** Green-path run:

```bash
export NX_WORKSPACE_ROOT_PATH=$PWD
npx nx run astro-kbve:sync:professiondb --skip-nx-cache 2>&1 | tail -8; echo "exit=${PIPESTATUS[0]}"
```

Expected: `Wrote .../xref-index.json`, `exit=0`.

- [ ] **Step 3:** Confirm the only `xref-index.json` content diff is the `content_version` line:

```bash
git diff -- packages/data/codegen/generated/xref-index.json | grep -E "^[+-]" | grep -v "^[+-][+-]"
```

Expected: one `-"content_version": "phase1"` / one `+"content_version": "sha256-…"`.

- [ ] **Step 4:** Commit: `git commit -am "professiondb: hard-fail xref validator on error-class violations"` (script + regenerated `xref-index.json`).

## Task 4: register a weekly `professiondb` router route (A4)

**Files:** Create `packages/python/kbve/kbve/nx/routes/professiondb.py`; modify `packages/python/kbve/kbve/nx/routes/__init__.py` (import the module so `@route` registers); create `packages/python/kbve/tests/test_nx_professiondb_route.py`. NO workflow file changes — `ci-daily-content.yml`'s weekly cron picks up weekly routes automatically.

**Design contract (CRITICAL):** unlike `routes/proto.py` (which CATCHES codegen failure → `skipped=True` soft warn), the professiondb route's `build()` MUST let a validator hard-fail PROPAGATE — the integrity gate has to FAIL the weekly job, not warn. So: run `sync:professiondb` via a helper that raises on non-zero exit, and do NOT catch that exception in `build()`. On success, detect drift on the generated dir + Unity StreamingAssets and return the changed files (auto-PR'd by the workflow).

- [ ] **Step 1:** Read `routes/proto.py` (mirror `_run`/`_detect_drift`/`repo_root_for`/`@route`) and `routes/__init__.py` (see how existing routes are imported/registered).
- [ ] **Step 2:** Create `routes/professiondb.py`:

```python
"""The ``professiondb`` route — weekly integrity audit for the unified DB.

Runs ``nx run astro-kbve:sync:professiondb`` (which regenerates the professiondb
data + runtime view and runs the hard-fail xref validator). A validator failure
raises out of ``build`` so the weekly job fails; regen drift is reported as
changed files and auto-PR'd like every other route.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from ..builder import BuildContext, BuildResult, PlanResult, repo_root_for
from ..router import route

_GEN_TIMEOUT = 600
_DRIFT_PATHS = (
    "packages/data/codegen/generated/professiondb-data.json",
    "packages/data/codegen/generated/professiondb-data.binpb",
    "packages/data/codegen/generated/professiondb-runtime.json",
    "packages/data/codegen/generated/xref-index.json",
    "apps/rareicon/unity-rareicon/Assets/StreamingAssets/professiondb-runtime.json",
)


class ProfessiondbValidationError(Exception):
    """Raised when the professiondb xref validator hard-fails."""


def _run(cmd: list[str], cwd: Path, timeout: int = _GEN_TIMEOUT) -> str:
    proc = subprocess.run(
        cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout
    )
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout).strip()[-600:]
        raise ProfessiondbValidationError(
            "%s failed (exit %d): %s" % (" ".join(cmd), proc.returncode, tail)
        )
    return proc.stdout


def _changed(repo_root: Path) -> list[str]:
    out = subprocess.run(
        ["git", "diff", "--name-only", "--", *_DRIFT_PATHS],
        cwd=str(repo_root),
        capture_output=True,
        text=True,
    ).stdout
    return [f for f in out.splitlines() if f]


@route("professiondb", "weekly", needs=("node",))
class ProfessiondbRoute:
    def plan(self, ctx: BuildContext) -> PlanResult:
        return PlanResult(
            "professiondb",
            True,
            "revalidate professiondb + regen (git-diff guard drops no-ops)",
            [],
        )

    def build(self, ctx: BuildContext) -> BuildResult:
        repo_root = repo_root_for(ctx.content_root)
        _run(
            ["npx", "nx", "run", "astro-kbve:sync:professiondb", "--skip-nx-cache"],
            repo_root,
        )
        return BuildResult("professiondb", _changed(repo_root), False, "validated")
```

Note: `build()` deliberately does NOT wrap `_run` in try/except — a `ProfessiondbValidationError` propagates to `build_main`, exiting non-zero and failing the weekly job. `needs=("node",)`: nx + node only (the gen reads a prebuilt descriptor `.binpb`, no protoc). If the `sync:mapdb`/`sync:itemdb` dependency chain turns out to need protoc at build time, add `"protoc"` to `needs` and note it.

- [ ] **Step 3:** In `routes/__init__.py`, add the import registering the route (match the existing import style, alphabetical if the file is ordered):

```python
from . import professiondb  # noqa: F401
```

(Use whatever import form the file already uses for `proto`/`graph`/etc.)

- [ ] **Step 4:** Create `tests/test_nx_professiondb_route.py` mirroring `tests/test_nx_proto_route.py`. Cover: (a) the route is registered with cadence `weekly` and appears in `select("weekly")`; (b) `plan()` returns `needs_work=True`; (c) `build()` PROPAGATES on validator failure — monkeypatch the module `_run` to raise `ProfessiondbValidationError` and assert `build()` raises (NOT skipped=True); (d) `build()` on success returns a `BuildResult` with `skipped=False` and the changed-file list from a monkeypatched `_changed`. Example skeleton (adapt imports/fixtures to the real test module):

```python
import pytest
from kbve.nx.router import get, select
from kbve.nx.routes import professiondb as mod


def test_registered_weekly():
    assert any(r.name == "professiondb" for r in select("weekly"))
    assert get("professiondb").cadence == "weekly"


def test_plan_needs_work(tmp_path):
    ctx = _ctx(tmp_path)
    assert get("professiondb").plan(ctx).needs_work is True


def test_build_propagates_validator_failure(monkeypatch, tmp_path):
    def boom(cmd, cwd, timeout=mod._GEN_TIMEOUT):
        raise mod.ProfessiondbValidationError("xref FAIL")
    monkeypatch.setattr(mod, "_run", boom)
    with pytest.raises(mod.ProfessiondbValidationError):
        get("professiondb").build(_ctx(tmp_path))


def test_build_success_reports_drift(monkeypatch, tmp_path):
    monkeypatch.setattr(mod, "_run", lambda *a, **k: "ok")
    monkeypatch.setattr(mod, "_changed", lambda root: ["x.json"])
    res = get("professiondb").build(_ctx(tmp_path))
    assert res.skipped is False and res.changed == ["x.json"]
```

Define `_ctx(tmp_path)` the way the sibling route tests build a `BuildContext` (copy their fixture/helper).

- [ ] **Step 5:** Run the route tests + a registry smoke check:

```bash
cd packages/python/kbve && uv run pytest tests/test_nx_professiondb_route.py -q 2>&1 | tail -15
uv run python -c "from kbve.nx.routes import *; from kbve.nx.router import select; print('weekly routes:', [r.name for r in select('weekly')])"
```

Expected: tests pass; `professiondb` appears in the weekly routes list.

- [ ] **Step 6:** Confirm the route surfaces in the router matrix for the weekly cadence (the exact command the workflow runs):

```bash
cd packages/python/kbve && uv run kbve-nx-router --cadence weekly --json 2>/dev/null | python -c "import sys,json; d=json.load(sys.stdin); print('professiondb in matrix:', any(i.get('route')=='professiondb' for i in (d.get('include') or d)))"
```

Expected: `professiondb in matrix: True`.

- [ ] **Step 7:** Commit: `git commit -am "nx-router: add weekly professiondb integrity-audit route"`.

## Task 5: UE forward-hook — add `ProfessionActionRef`, keep `HarvestTimeMs` (B)

**Files:** Modify `packages/unreal/KBVEMapDB/Source/KBVEMapDB/Public/KBVEMapTypes.h` and `.../Private/KBVEMapDatabase.cpp`. Additive only.

- [ ] **Step 1:** Re-read both files for current line numbers + the exact UPROPERTY macro style on sibling fields.
- [ ] **Step 2:** In `KBVEMapTypes.h`, after the `HarvestTimeMs` property, add (match the sibling UPROPERTY macro/category verbatim; `FName` to match `HarvestYield`):

```cpp
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	FName ProfessionActionRef;
```

Do NOT modify `HarvestTimeMs`. Do NOT touch `FKBVEWorldObjectFragment`.

- [ ] **Step 3:** In `KBVEMapDatabase.cpp`, immediately after the `harvestTimeMs` parse, add (reuses the existing `FString Str;`, mirrors the `harvestYield` line):

```cpp
		if (Obj->TryGetStringField(TEXT("professionActionRef"), Str)) Def.ProfessionActionRef = FName(*Str);
```

- [ ] **Step 4:** Static verification (NO UE compiler here — honest):

```bash
grep -n "ProfessionActionRef" packages/unreal/KBVEMapDB/Source/KBVEMapDB/Public/KBVEMapTypes.h packages/unreal/KBVEMapDB/Source/KBVEMapDB/Private/KBVEMapDatabase.cpp
grep -n "HarvestTimeMs" packages/unreal/KBVEMapDB/Source/KBVEMapDB/Public/KBVEMapTypes.h packages/unreal/KBVEMapDB/Source/KBVEMapDB/Private/KBVEMapDatabase.cpp
grep -c "professionActionRef" packages/data/codegen/generated/mapdb-data.json
```

Expected: `ProfessionActionRef` once in header + once in cpp; `HarvestTimeMs` still in both; mapdb emits `professionActionRef` on 19 nodes. Real UE compile happens only in the Unreal pipeline, not here.

- [ ] **Step 5:** Commit: `git commit -am "KBVEMapDB: add ProfessionActionRef forward hook to world object def"`.

## Task 6: final gate proof + push

- [ ] **Step 1:** Green run: `npx nx run astro-kbve:sync:professiondb --skip-nx-cache 2>&1 | tail -6; echo "exit=${PIPESTATUS[0]}"` → `exit=0`.
- [ ] **Step 2:** Prove hard-fail triggers (temporary, reverted). Back up to scratchpad, inject a dangling `professionActionRef` into `mapdb-data.json`, run the xref stage standalone, confirm non-zero exit + `[xref FAIL]`, then restore:

```bash
SP=/private/tmp/claude-501/-Users-alappatel-Documents-GitHub-kbve/4f622281-dd07-44e0-b51d-110a1159a753/scratchpad
cp packages/data/codegen/generated/mapdb-data.json $SP/mapdb-data.backup.json
node -e 'const f="packages/data/codegen/generated/mapdb-data.json",fs=require("fs");const j=JSON.parse(fs.readFileSync(f,"utf8"));j.objectDefs.find(o=>o.professionActionRef).professionActionRef="gather-DOES-NOT-EXIST";fs.writeFileSync(f,JSON.stringify(j,null,2))'
node packages/data/codegen/gen-professiondb-xref.mjs; echo "exit=$?"
cp $SP/mapdb-data.backup.json packages/data/codegen/generated/mapdb-data.json
git status --short
```

Expected: middle run prints `[xref FAIL]` + non-zero `exit`; after restore `git status --short` is empty. If not clean, re-run `sync:professiondb` to regenerate.

- [ ] **Step 3:** Full route test + lint pass: `cd packages/python/kbve && uv run pytest tests/test_nx_professiondb_route.py -q 2>&1 | tail -5`.
- [ ] **Step 4:** Push: `git push -u origin trunk/professiondb-phase4-validator-1785669552`. (Controller opens PR after final review.)

## Decisions (confirm at review)

1. **content_version format** `sha256-<16 hex>` over the canonicalized payload (set-equality, not order). Confirm vs full 64-hex or a `phaseN.<hash>` composite.
2. **Gate home = weekly `kbve-nx-router` route**, NOT a per-PR workflow. The weekly `0 2 * * 1` cron regenerates + validates; a hard-fail fails the weekly job and drift auto-PRs. Confirm weekly cadence (vs daily, or both).
3. **Validator failure PROPAGATES** out of the route `build()` (fails the job) — deliberately unlike proto's catch-and-skip. Confirm the integrity gate should hard-fail the weekly run.
4. **`durationMs` in the ownership list** — professiondb-exclusive today (0 items carry it). Confirm no future itemdb use.
5. **`orphan_action` = WARN**; fires only when an action has neither outputs nor a node. Confirm soft.

## RISKS

- **content_version hashing:** deterministic (recursively key-sorted + scalar-array-sorted, excludes the version field). Set-reorder won't bump the version — intended.
- **Current data passes hard-fail: VERIFIED 0 errors.** The trap: **24 `SKILLING_*` recipes + 146 `action`-verb items** are legit metadata — the invariant is scoped to structural ownership fields, NEVER a substring/field grep (which would break the gate on ~170 items).
- **Cycle detection N/A** — no unlock/prereq edge; not fabricated.
- **Detection latency:** the gate is post-merge (weekly, or manual `kbve-nx-router --route professiondb` / local `sync:professiondb`), not merge-blocking. Acceptable because professiondb data is not runtime-critical (consumers read baked data; a broken xref is silently-wrong data, caught + auto-PR-corrected by the weekly audit). If merge-blocking is ever wanted, a thin `pull_request` guard can be added later reusing the same `sync:professiondb`.
- **Route `needs`:** `("node",)` assumed sufficient (nx + prebuilt descriptor). If the `sync:mapdb`/`sync:itemdb` chain needs protoc at build time, add `"protoc"` — verify in Task 4 Step 6 (matrix `needs`).
- **UE compile gate:** NO UE toolchain here. Subsystem B is static-verified only. Real compile is the Unreal pipeline, outside this change's verifiable surface.

## Self-Review

- **Scope:** closes epic #14852 remainder — professiondb becomes the enforced unified source of truth via a weekly integrity audit riding the existing router, plus the UE forward hook. Descoped (per user): xref-index.binpb, professiondb-uecpp codegen, bespoke PR-guard workflow.
- **Safety:** hard-fail proven to pass on current data (Task 2) AND proven to trigger on a bad ref (Task 6) before push; the route test asserts `build()` PROPAGATES (job-failing) rather than skips.
- **Atomicity:** the validator only ever throws BEFORE `writeFileSync`, so a red graph never overwrites a good `xref-index.json`.
