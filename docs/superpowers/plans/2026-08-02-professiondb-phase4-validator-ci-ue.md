# professiondb Phase 4 (FINAL) — Validator Hard-Fail + CI Gate + UE Forward-Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the professiondb cross-reference generator from an inert warn-only script into a real CI gate, and plant the Unreal forward-reference so UE can later consume professiondb — in ONE PR: (A1) content-derived `content_version`; (A2) single-source + graph-integrity checks; (A3) flip validator to hard-fail with exit propagation; (A4) wire `sync:professiondb` into CI (runs in ZERO workflows today); (B) add `ProfessionActionRef` to `FKBVEWorldObjectDef` + parse, KEEPING `HarvestTimeMs`.

**Architecture:** MDX → `gen-professiondb-data.mjs` (emits `professiondb-data.json`/`.binpb`/`professiondb-runtime.json`) → calls `generateXref()` from `gen-professiondb-xref.mjs` (emits `xref-index.json` joining itemdb+professiondb+mapdb). The xref stage is the only place all three DBs are loaded together — making IT throw fails the whole `sync:professiondb` nx target. UE (`KBVEMapDB`) hand-parses `mapdb-data.json`; adding one struct field + one parse line is a non-destructive forward reference (no UE skill/loader system exists yet).

**Tech Stack:** Node 24 ESM (`node:crypto` `createHash`), nx `run-commands`, GitHub Actions (pnpm 11.15.0), Unreal C++ (`USTRUCT`/`FName`/`FJsonObject`) — static verification only, no UE toolchain here.

## Global Constraints

- Work only in worktree `/Users/alappatel/Documents/GitHub/kbve-professiondb-phase4-validator`, branch `trunk/professiondb-phase4-validator-1785669552`. Never the main tree. Absolute paths.
- DROP ALL code comments (JS + C++) in authored/edited code.
- Commits: no `Co-Authored-By`, no "Generated with Claude".
- Build/data only via nx + `gen-*.mjs`; MDX is source of truth; never hand-edit generated JSON (except the temporary, reverted fault-injection in Task 6b).
- `content_version` MUST be a deterministic pure function of the DATA — no `Date.now()`/`new Date()`/`Math.random()`.
- CI edits touch shared workflows: show exact yaml, confirm no unrelated job is broken/slowed, place the hard-fail where a professiondb data error correctly fails the build.

## Verified facts (VERIFIED read-only — re-confirm line numbers before editing)

- `gen-professiondb-xref.mjs`: `CONTENT_VERSION='phase1'` ~L13; written as `content_version` ~L89; `writeFileSync(outPath, JSON.stringify(index,null,2))` ~L97; warn-only tail ~L102-106; standalone guard ~L109; `export function main()` ~L15. Validates 3 edge classes into `warnings[]`; NO process.exit/throw, NO graph-integrity, NO single-source-invariant.
- `gen-professiondb-data.mjs`: `generateXref()` called ~L243 inside synchronous `main()`; bare `main();` ~L246.
- `project.json` `sync:professiondb` ~L395-418, command `node packages/data/codegen/gen-professiondb-data.mjs`, outputs include `xref-index.json` + Unity `professiondb-runtime.json`; `descriptors/professiondb.binpb` already in inputs.
- **Current data passes hard-fail (VERIFIED 0 ERRORS):** 8 professions, 48 actions (gather=29/compress=19), 19 bidirectionally-linked nodes; 0 dangling item/node/action refs, 0 back-ref mismatches, 0 itemdb ownership fields.
- **False-positive trap (VERIFIED, CRITICAL):** itemdb has **24 recipes carrying `skill:"SKILLING_*"`** and **146 items carrying an `action` verb** (`consume`/`equip`/…) — all LEGIT crafting/use metadata. A naive `skilling`/`compress`/`action` substring or field check would flag ~170 items and break CI. The single-source invariant is scoped to a fixed list of STRUCTURAL OWNERSHIP FIELDS only (never `action`, never `recipes[].skill`).
- **No unlock/prereq graph:** action fields are `ref,key,name,requiredLevel,xpReward,inputs,outputs,durationMs,resourceNodeRef,toolRefs`. No `unlocks`/`requires` edge → cycle detection is N/A (do not fabricate an edge).
- **CI gap (VERIFIED):** grep `.github/workflows/*` for `sync:professiondb`/`gen-professiondb` → ZERO hits. Peer syncs run only in `ci-unity.yml` (workflow_dispatch-only, `if: contains(inputs.project_path,'rareicon')`) — cannot gate PRs. `ci-manifest-guard.yml` is the canonical PR-triggered guard pattern (pull_request + path filter → nx run → hard-fail; node 24, pnpm 11.15.0). `ci-unity.yml` regen step appears TWICE (L229-235 test job, L355-361 build job), each ending `sync:mapdb`.
- `KBVEMapTypes.h`: `FKBVEWorldObjectDef` with `FName HarvestYield;` (~L39) and `int32 HarvestTimeMs = 0;` (~L48); string refs typed `FName`.
- `KBVEMapDatabase.cpp`: `LoadFromJson` ~L42-104; `FString Str;` scratch ~L79; `if (Obj->TryGetStringField(TEXT("harvestYield"), Str)) Def.HarvestYield = FName(*Str);` ~L91; `Obj->TryGetNumberField(TEXT("harvestTimeMs"), Def.HarvestTimeMs);` ~L94.
- `mapdb-data.json` emits `professionActionRef` on 19 nodes (VERIFIED present).

---

## Task 1: content_version → deterministic content hash (A1)

**Files:** Modify `packages/data/codegen/gen-professiondb-xref.mjs`.

**Scheme:** `content_version = sha256-<first 16 hex of SHA-256 over a canonicalized copy of the index payload excluding content_version>`. Canonical = recursively sort object keys + sort arrays-of-scalars, so map/insertion order can't perturb the hash. Pure over the three input JSONs, reproducible.

- [ ] **Step 1:** Re-read the script; confirm the import line, the `CONTENT_VERSION` literal, the `const index = {...}` block, and the `writeFileSync` line.
- [ ] **Step 2:** Add `import { createHash } from 'node:crypto';` next to the existing `node:fs` import.
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

- [ ] **Step 5:** Replace the `const index = {...}` block so the payload is built first and hashed, `content_version` stamped first (adapt the payload keys to the script's real variable names — `producedBy`/`inputTo`/`toolFor`/`nodeLinks`/`nodeByRef`/`itemKeyByRef`):

```js
const payload = {
	slug_to_key: Object.fromEntries(itemKeyByRef),
	produced_by: producedBy,
	input_to: inputTo,
	tool_for: toolFor,
	node_links: nodeLinks,
	node_by_ref: nodeByRef,
};
const index = { content_version: contentVersion(payload), ...payload };
```

Match the EXISTING payload keys/shape of the current `index` object — if the current file names a key differently (e.g. `slugToKey`), keep the current emitted key names so `xref-index.json`'s diff is limited to the version line.

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

**Files:** Modify `packages/data/codegen/gen-professiondb-xref.mjs`. Introduce `errors[]` alongside `warnings[]`; capture the FULL itemdb objects (script currently keeps only `ref→key`).

- [ ] **Step 1:** Where itemdb is parsed, retain both the raw object and the item list:

```js
const itemsRaw = JSON.parse(readFileSync(itemdbPath, 'utf8'));
const items = itemsRaw.items ?? [];
```

(Keep the existing `ref→key` map build; just also keep `itemsRaw`/`items`.)

- [ ] **Step 2:** Add `const errors = [];` next to `const warnings = [];`.
- [ ] **Step 3:** Single-source invariant — STRUCTURAL OWNERSHIP FIELDS ONLY (never `action`/`recipes[].skill`), after the item map is built:

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

- [ ] **Step 4:** Reclassify the existing three edge checks (unresolved item ref, missing `resourceNodeRef`, missing/mismatched `professionActionRef`) from `warnings.push` to `errors.push` — they describe broken references and are 0 today.
- [ ] **Step 5:** Graph-integrity (back-ref consistency + orphan) after the objectDefs loop (adapt `objectDefByRef`/`professions` to real names):

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

- [ ] **Step 6:** Prove 0 ERRORs on current data (VERIFIED clean; the standalone script mirrors the new logic):

```bash
node -e '
const fs=require("fs");
const B="packages/data/codegen/generated/";
const itemsRaw=JSON.parse(fs.readFileSync(B+"itemdb-data.json","utf8"));
const items=itemsRaw.items??[];
const professions=JSON.parse(fs.readFileSync(B+"professiondb-data.json","utf8")).professions??[];
const objectDefs=JSON.parse(fs.readFileSync(B+"mapdb-data.json","utf8")).objectDefs??[];
const keyByRef=new Map(items.map(i=>[i.ref,i.key]));
const actByRef=new Map(),objByRef=new Map(objectDefs.map(o=>[o.ref,o]));
const errors=[];
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

- [ ] **Step 1:** Replace the warn-only tail so a broken graph never overwrites a good `xref-index.json`, then throws (propagates through the synchronous `generateXref()` call → non-zero exit → nx target fails). Adapt the summary counters to the real variable names:

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

Use `throw` (not `process.exit`) — it propagates through `gen-professiondb-data.mjs`'s bare `main()` AND the standalone entrypoint. Do NOT add try/catch around `generateXref()` in `gen-professiondb-data.mjs` (would swallow the gate).

- [ ] **Step 2:** Green-path run:

```bash
export NX_WORKSPACE_ROOT_PATH=$PWD
npx nx run astro-kbve:sync:professiondb --skip-nx-cache 2>&1 | tail -8; echo "exit=${PIPESTATUS[0]}"
```

Expected: `Wrote .../xref-index.json`, `exit=0`.

- [ ] **Step 3:** Confirm the only `xref-index.json` content diff is the `content_version` line:

```bash
git diff -- packages/data/codegen/generated/xref-index.json | grep -E "^[+-]" | grep -v "^[+-][+-]" | head
```

Expected: one `-"content_version": "phase1"` / one `+"content_version": "sha256-…"`.

- [ ] **Step 4:** Commit: `git commit -am "professiondb: hard-fail xref validator on error-class violations"` (script + regenerated `xref-index.json`).

## Task 4: wire `sync:professiondb` into CI (A4)

**Files:** Create `.github/workflows/ci-professiondb-guard.yml`; modify `.github/workflows/ci-unity.yml`.

- [ ] **Step 1:** Create the PR gate `ci-professiondb-guard.yml` (modeled on `ci-manifest-guard.yml`; path-filtered to the sync inputs; own concurrency group; `contents: read`):

```yaml
name: CI - ProfessionDB Guard

on:
    pull_request:
        branches:
            - main
            - dev
        paths:
            - 'apps/kbve/astro-kbve/src/content/docs/professiondb/**'
            - 'packages/data/codegen/gen-professiondb-data.mjs'
            - 'packages/data/codegen/gen-professiondb-xref.mjs'
            - 'packages/data/codegen/descriptors/professiondb.binpb'
            - '.github/workflows/ci-professiondb-guard.yml'
    workflow_dispatch:

concurrency:
    group: ${{ github.workflow }}-${{ github.ref }}
    cancel-in-progress: false

permissions:
    contents: read

jobs:
    verify:
        name: Verify professiondb xref validator passes
        runs-on: ubuntu-latest
        timeout-minutes: 15
        steps:
            - uses: actions/checkout@v7
            - uses: actions/setup-node@v7
              with:
                  node-version: 24
            - uses: pnpm/action-setup@v5
              with:
                  version: 11.15.0
                  run_install: false
            - id: pnpm-store
              run: echo "STORE_PATH=$(pnpm store path --silent)" >> "$GITHUB_OUTPUT"
            - uses: actions/cache@v6
              with:
                  path: ${{ steps.pnpm-store.outputs.STORE_PATH }}
                  key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml', 'package.json') }}
                  restore-keys: |
                      ${{ runner.os }}-pnpm-store-
            - run: pnpm install --frozen-lockfile
            - run: npx nx run astro-kbve:sync:professiondb --skip-nx-cache
```

Re-read `ci-manifest-guard.yml` first and match its EXACT action versions (`checkout@`, `setup-node@`, `cache@`) — use whatever it uses, don't assume v7/v6.

- [ ] **Step 2:** Mirror into `ci-unity.yml` — add `npx nx run astro-kbve:sync:professiondb` after `sync:mapdb` in BOTH regen steps (~L235 and ~L361). Confirm both via `grep -n "sync:mapdb" .github/workflows/ci-unity.yml` (two hits); match indentation exactly.
- [ ] **Step 3:** Validate yaml parses:

```bash
node -e 'const y=require("fs").readFileSync(".github/workflows/ci-professiondb-guard.yml","utf8"); console.log("guard bytes",y.length); require("fs").readFileSync(".github/workflows/ci-unity.yml","utf8")'
git diff --stat -- .github/workflows/
```

- [ ] **Step 4:** Commit: `git commit -am "ci: gate professiondb sync on PRs and unity builds"`.

## Task 5: UE forward-hook — add `ProfessionActionRef`, keep `HarvestTimeMs` (B)

**Files:** Modify `packages/unreal/KBVEMapDB/Source/KBVEMapDB/Public/KBVEMapTypes.h` and `.../Private/KBVEMapDatabase.cpp`. Additive only.

- [ ] **Step 1:** Re-read both files for current line numbers + the exact UPROPERTY macro style used on sibling fields.
- [ ] **Step 2:** In `KBVEMapTypes.h`, after the `HarvestTimeMs` property, add (match the sibling UPROPERTY macro/category verbatim; type `FName` to match `HarvestYield`):

```cpp
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Map")
	FName ProfessionActionRef;
```

Do NOT modify `HarvestTimeMs`. Do NOT touch `FKBVEWorldObjectFragment`.

- [ ] **Step 3:** In `KBVEMapDatabase.cpp`, immediately after the `harvestTimeMs` parse, add (reuses the existing `FString Str;` scratch, mirrors the `harvestYield` line):

```cpp
		if (Obj->TryGetStringField(TEXT("professionActionRef"), Str)) Def.ProfessionActionRef = FName(*Str);
```

- [ ] **Step 4:** Static verification (NO UE compiler here — honest):

```bash
grep -n "ProfessionActionRef" packages/unreal/KBVEMapDB/Source/KBVEMapDB/Public/KBVEMapTypes.h packages/unreal/KBVEMapDB/Source/KBVEMapDB/Private/KBVEMapDatabase.cpp
grep -n "HarvestTimeMs" packages/unreal/KBVEMapDB/Source/KBVEMapDB/Public/KBVEMapTypes.h packages/unreal/KBVEMapDB/Source/KBVEMapDB/Private/KBVEMapDatabase.cpp
grep -c "professionActionRef" packages/data/codegen/generated/mapdb-data.json
```

Expected: `ProfessionActionRef` once in header + once in cpp; `HarvestTimeMs` still in both; mapdb emits `professionActionRef` on 19 nodes. Assert manually: `FName` matches `HarvestYield`; parse mirrors `harvestYield` + reuses `Str`; JSON key casing `professionActionRef` matches. Real UE compile happens only in the Unreal pipeline, not here.

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

Expected: middle run prints `[xref FAIL]` + `exit=1`; after restore `git status --short` is empty (mapdb restored byte-identical). If the tree isn't clean, re-run `sync:professiondb` to regenerate.

- [ ] **Step 3:** Push: `git push -u origin trunk/professiondb-phase4-validator-1785669552`. (Controller opens PR after final review.)

## Decisions (confirm at review)

1. **content_version format** `sha256-<16 hex>` over the canonicalized payload (set-equality, not order). Confirm vs full 64-hex or a `phaseN.<hash>` composite keeping a human phase tag.
2. **Primary gate = NEW `ci-professiondb-guard.yml`** (PR-triggered) since `ci-unity.yml` is dispatch-only + rareicon-scoped and can't gate professiondb-MDX PRs. Confirm the dedicated workflow (recommended).
3. **Mirror line into `ci-unity.yml`** (both jobs) — fixes latent staleness where Unity builds ship a stale `professiondb-runtime.json`. Confirm vs single-file diff.
4. **`durationMs` in the ownership list** — professiondb-exclusive today (0 items carry it). Confirm no future itemdb use.
5. **`orphan_action` = WARN** (10 gather actions legitimately have no `resourceNodeRef`); WARN fires only when an action has neither outputs nor a node. Confirm soft.

## RISKS

- **content_version hashing:** deterministic (recursively key-sorted + scalar-array-sorted, excludes the version field). Set-reorder won't bump the version — intended. File array order left as-is to minimize diff churn.
- **Current data passes hard-fail: VERIFIED 0 errors.** The trap: **24 `SKILLING_*` recipes + 146 `action`-verb items** are legit metadata — the invariant is scoped to structural ownership fields, NEVER a `skilling`/`compress`/`action` substring/field grep (which would break CI on ~170 items).
- **Cycle detection N/A** — no unlock/prereq edge in the action schema; not fabricated.
- **CI blast radius:** new guard = own concurrency group + `contents: read` + path filter → cannot affect other jobs; `ci-unity.yml` edits are inside `if: contains(inputs.project_path,'rareicon')` steps → only rareicon dispatches pay one extra nx target.
- **UE compile gate:** NO UE toolchain here. Subsystem B is static-verified only (field declared once, parse added once, `HarvestTimeMs` preserved, `FName` matches `HarvestYield`, JSON key casing matches). Real compile is the Unreal pipeline, outside this change's verifiable surface.

## Self-Review

- **Scope:** closes epic #14852 remainder — validator becomes a live CI gate + UE forward hook. Descoped (per user): xref-index.binpb, professiondb-uecpp codegen.
- **Safety:** hard-fail proven to pass on current data (Task 2 Step 6) AND proven to trigger on a bad ref (Task 6 Step 2) before the branch is pushed.
- **Atomicity:** validator only ever throws BEFORE `writeFileSync`, so a red graph never overwrites a good `xref-index.json`.
