# professiondb Phase 1 — Restructure + Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure professiondb authoring to folder-per-profession / file-per-action, add derived-assembly codegen, add `key`+`facility_ref` to `ProfessionAction`, and land the cross-ref validator + `xref-index` emitter in **warn-only** mode.

**Architecture:** professiondb MDX becomes a nested collection: `professiondb/<profession>/index.mdx` (`kind: profession`) + `professiondb/<profession>/<action>.mdx` (`kind: action`). Astro validates via a discriminated union on `kind`. `gen-professiondb-data.mjs` groups action files by their `profession` field, asserts folder==field, strips authoring-only keys (`kind`/`profession`/`title`), and assembles each profession's `actions[]`. A new `gen-professiondb-xref.mjs` makes one linear pass over professiondb action edges, resolves them against itemdb, and emits `xref-index.json` keyed on numeric `key` — warn-only this phase (logs unresolved, never fails the build).

**Tech Stack:** protobuf (`protoc` + `@bufbuild/protobuf`), `@kbve/devops` proto-to-zod codegen, Astro content collections (`astro/zod` discriminated union), gray-matter, nx.

## Global Constraints

- Worktree: `/Users/alappatel/Documents/GitHub/kbve-professiondb-mapdb-link`, branch `trunk/professiondb-mapdb-link-1785228003`. All work here; never the main tree.
- No comments in authored code unless the surrounding file already has them (user rule: drop all comments). The generated files carry their own headers.
- Proto changes are **additive only** this phase (`key`, `facility_ref`). No field removals, no reserves yet — those are Phases 2–4.
- Run nx via `./kbve.sh -nx <target>` from the worktree (auto-sources env). Set `export NX_WORKSPACE_ROOT_PATH=$PWD` for direct `npx tsx` codegen calls.
- Item refs the seed points at may not exist in itemdb yet — that is expected in Phase 1; the validator is **warn-only** precisely so this phase is green despite the gaps. Do NOT author itemdb items here (Phase 2).
- Proto wire shape stays `Profession { repeated ProfessionAction actions }`. `kind`/`profession`/`title` are authoring-only frontmatter, stripped before proto encode (like the existing `title` strip).

---

### Task 1: Add `key` + `facility_ref` to ProfessionAction (proto + regen)

**Files:**

- Modify: `packages/data/proto/profession/professiondb.proto`
- Regenerate: `packages/data/codegen/descriptors/professiondb.binpb`, `packages/data/codegen/generated/professiondb-schema.ts`

**Interfaces:**

- Produces: `ProfessionAction.key` (uint32, field 12) and `ProfessionAction.facility_ref` (optional string, field 13). Later tasks assign a unique `key` per action file and the validator keys the xref index on it.

- [ ] **Step 1: Add the two fields to the proto message**

In `packages/data/proto/profession/professiondb.proto`, the `ProfessionAction` message currently ends at field 11 (`icon`). Add after it:

```proto
message ProfessionAction {
  string ref = 1;
  string name = 2;
  optional string description = 3;

  repeated ResourceAmount inputs = 4;
  repeated ResourceAmount outputs = 5;

  uint32 required_level = 6;
  uint32 xp_reward = 7;
  optional uint32 duration_ms = 8;

  repeated string tool_refs = 9;
  optional string emoji = 10;
  optional string icon = 11;

  uint32 key = 12;
  optional string facility_ref = 13;
}
```

- [ ] **Step 2: Regenerate descriptor + zod schema**

Run: `cd /Users/alappatel/Documents/GitHub/kbve-professiondb-mapdb-link && export NX_WORKSPACE_ROOT_PATH=$PWD && npx tsx packages/data/codegen/gen-all.mjs professiondb 2>&1 | grep -v "npm warn"`
Expected: `✓ profession/professiondb.proto → professiondb.binpb` and `✓ professiondb-schema.ts`.

- [ ] **Step 3: Verify the generated schema carries the new fields**

Run: `grep -nE "key:|facility_ref:" packages/data/codegen/generated/professiondb-schema.ts`
Expected: within `ProfessionActionSchema`, `key: z.number()` and `facility_ref: z.string().optional()` present.

- [ ] **Step 4: Commit**

```bash
git add packages/data/proto/profession/professiondb.proto packages/data/codegen/descriptors/professiondb.binpb packages/data/codegen/generated/professiondb-schema.ts
git commit -m "feat(professiondb): add key + facility_ref to ProfessionAction"
```

---

### Task 2: Discriminated-union Astro schema (`kind: profession | action`)

**Files:**

- Create: `apps/kbve/astro-kbve/src/data/schema/IProfessionActionSchema.ts`
- Modify: `apps/kbve/astro-kbve/src/data/schema/IProfessionSchema.ts`
- Modify: `apps/kbve/astro-kbve/src/data/schema/index.ts`
- Modify: `apps/kbve/astro-kbve/src/content.config.ts`

**Interfaces:**

- Consumes: generated `ProfessionSchema`, `ProfessionActionSchema` from `@kbve/proto/professiondb-schema` (Task 1).
- Produces: `IProfessionEntrySchema` — a `z.discriminatedUnion('kind', [...])` used as the `professiondb` collection schema. Profession variant adds `kind: z.literal('profession')`; action variant adds `kind: z.literal('action')` + `profession: z.string()`.

- [ ] **Step 1: Create the action schema wrapper**

Create `apps/kbve/astro-kbve/src/data/schema/IProfessionActionSchema.ts`:

```ts
import { z } from 'astro/zod';
import { ProfessionActionSchema } from '@kbve/proto/professiondb-schema';

export const IProfessionActionSchema = ProfessionActionSchema.extend({
	kind: z.literal('action'),
	profession: z.string(),
	title: z.string().optional(),
	drafted: z.boolean().optional(),
}).passthrough();

export type IProfessionAction = z.infer<typeof IProfessionActionSchema>;
```

- [ ] **Step 2: Extend the profession schema with the discriminator + build the union**

Replace the body of `apps/kbve/astro-kbve/src/data/schema/IProfessionSchema.ts` with:

```ts
import { z } from 'astro/zod';
import {
	ProfessionSchema,
	ProfessionCategorySchema,
	CurveKindSchema,
} from '@kbve/proto/professiondb-schema';
import { IProfessionActionSchema } from './IProfessionActionSchema';

export { ProfessionCategorySchema, CurveKindSchema };
export type {
	Profession,
	ProfessionAction,
	ProfessionUnlock,
	ResourceAmount,
	ExperienceCurve,
	ProfessionCategoryValue,
	CurveKindValue,
} from '@kbve/proto/professiondb-schema';

export const IProfessionSchema = ProfessionSchema.extend({
	kind: z.literal('profession'),
	title: z.string().optional(),
}).passthrough();

export type IProfession = z.infer<typeof IProfessionSchema>;

export const IProfessionEntrySchema = z.discriminatedUnion('kind', [
	IProfessionSchema,
	IProfessionActionSchema,
]);

export type IProfessionEntry = z.infer<typeof IProfessionEntrySchema>;
```

Note: `ProfessionSchema` requires `actions`? It does not — `actions` is `.optional()` in the generated schema, so an `index.mdx` with no inline actions still validates. Confirm in Step 4.

- [ ] **Step 3: Export the new schemas from the barrel**

In `apps/kbve/astro-kbve/src/data/schema/index.ts`, add after the `IProfessionSchema` export line:

```ts
export * from './IProfessionActionSchema';
```

(`IProfessionSchema.ts` already re-exports `IProfessionEntrySchema`, so `index.ts` needs no separate line for it.)

- [ ] **Step 4: Point the collection at the union schema**

In `apps/kbve/astro-kbve/src/content.config.ts`:

- Change the import `IProfessionSchema` → `IProfessionEntrySchema` in the `@/data/schema` import block.
- Change the `professiondb` collection's `schema:` from `IProfessionSchema` to `IProfessionEntrySchema`.

- [ ] **Step 5: Type-check the schema package compiles**

Run: `cd /Users/alappatel/Documents/GitHub/kbve-professiondb-mapdb-link && npx tsc --noEmit -p apps/kbve/astro-kbve/tsconfig.json 2>&1 | grep -iE "professiondb|IProfession" | head`
Expected: no errors referencing the profession schemas. (Astro sync in Task 4 is the functional gate.)

- [ ] **Step 6: Commit**

```bash
git add apps/kbve/astro-kbve/src/data/schema/IProfessionActionSchema.ts apps/kbve/astro-kbve/src/data/schema/IProfessionSchema.ts apps/kbve/astro-kbve/src/data/schema/index.ts apps/kbve/astro-kbve/src/content.config.ts
git commit -m "feat(professiondb): discriminated-union schema (kind: profession|action)"
```

---

### Task 3: Restructure the 7 seed professions to folders + per-action files

**Files:**

- Delete: `apps/kbve/astro-kbve/src/content/docs/professiondb/{mining,woodcutting,fishing,farming,smithing,cooking,alchemy}.mdx`
- Create: `apps/kbve/astro-kbve/src/content/docs/professiondb/<profession>/index.mdx` (×7)
- Create: `apps/kbve/astro-kbve/src/content/docs/professiondb/<profession>/<action>.mdx` (×14)
- Modify: `apps/kbve/astro-kbve/src/content/docs/professiondb/index.mdx` (add `kind: profession`)

**Interfaces:**

- Consumes: existing seed content (inline actions) — moved verbatim into per-action files.
- Produces: nested structure the Task 4 loader assembles. Each action file: `kind: action`, `profession: <parent ref>`, unique `ref` + unique `key`. Keys: assign 1–14 across all actions (unique across the whole action space).

**Key assignment (unique across all actions):**

| action ref          | key | profession  |
| ------------------- | --- | ----------- |
| mine-copper-ore     | 1   | mining      |
| mine-iron-ore       | 2   | mining      |
| chop-oak-log        | 3   | woodcutting |
| chop-willow-log     | 4   | woodcutting |
| catch-shrimp        | 5   | fishing     |
| catch-trout         | 6   | fishing     |
| grow-wheat          | 7   | farming     |
| grow-herb           | 8   | farming     |
| smelt-bronze-bar    | 9   | smithing    |
| forge-bronze-dagger | 10  | smithing    |
| cook-shrimp         | 11  | cooking     |
| bake-bread          | 12  | cooking     |
| brew-attack-potion  | 13  | alchemy     |
| brew-health-potion  | 14  | alchemy     |

- [ ] **Step 1: Add `kind: profession` to the top-level index placeholder**

In `apps/kbve/astro-kbve/src/content/docs/professiondb/index.mdx`, add `kind: 'profession'` to the frontmatter (below `name: 'Index'`). It stays `drafted: true`.

- [ ] **Step 2: Create the alchemy folder — index.mdx (no inline actions)**

Create `apps/kbve/astro-kbve/src/content/docs/professiondb/alchemy/index.mdx`:

```mdx
---
title: 'Alchemy'
kind: 'profession'
description: |
    Brew potions from herbs and reagents. A production discipline consuming
    farming output.
ref: 'alchemy'
key: 7
id: '01KPROFALCHEMY000000000007'
name: 'Alchemy'
category: 'production'
emoji: '⚗️'
max_level: 99
experience_curve:
    kind: 'polynomial'
    base_xp: 55
    growth_factor: 1.65
    max_level: 99
unlocks:
    - level: 12
      action_ref: 'brew-health-potion'
      description: 'Health potions become brewable.'
---

Alchemy brews potions from herbs and reagents, consuming farming output.
```

- [ ] **Step 3: Create the alchemy action files**

Create `apps/kbve/astro-kbve/src/content/docs/professiondb/alchemy/brew-attack-potion.mdx`:

```mdx
---
title: 'Brew Attack Potion'
kind: 'action'
profession: 'alchemy'
ref: 'brew-attack-potion'
key: 13
name: 'Brew Attack Potion'
required_level: 3
xp_reward: 25
duration_ms: 4000
inputs:
    - item_ref: 'guam-leaf'
      quantity: 1
    - item_ref: 'eye-of-newt'
      quantity: 1
outputs:
    - item_ref: 'attack-potion'
      quantity: 1
tool_refs:
    - 'vial'
---

Brew an attack potion from guam leaf and eye of newt.
```

Create `apps/kbve/astro-kbve/src/content/docs/professiondb/alchemy/brew-health-potion.mdx`:

```mdx
---
title: 'Brew Health Potion'
kind: 'action'
profession: 'alchemy'
ref: 'brew-health-potion'
key: 14
name: 'Brew Health Potion'
required_level: 12
xp_reward: 50
duration_ms: 4500
inputs:
    - item_ref: 'marrentill'
      quantity: 1
    - item_ref: 'red-spiders-egg'
      quantity: 1
outputs:
    - item_ref: 'health-potion'
      quantity: 1
tool_refs:
    - 'vial'
---

Brew a health potion from marrentill and red spider's egg.
```

- [ ] **Step 4: Repeat the split for the other 6 professions**

For each of `mining`, `woodcutting`, `fishing`, `farming`, `smithing`, `cooking`: create `<profession>/index.mdx` (copy the old file's frontmatter, add `kind: 'profession'`, **remove the `actions:` block**, keep `unlocks:`) and one `<profession>/<action-ref>.mdx` per action (add `kind: 'action'`, `profession: '<profession>'`, `key:` from the table above, `name`, and the action's `required_level`/`xp_reward`/`duration_ms`/`inputs`/`outputs`/`tool_refs` from the old inline entry; add a one-line body). Source content is the current inline `actions:` arrays in each old flat file.

- [ ] **Step 5: Delete the 7 old flat files**

```bash
cd /Users/alappatel/Documents/GitHub/kbve-professiondb-mapdb-link/apps/kbve/astro-kbve/src/content/docs/professiondb
rm mining.mdx woodcutting.mdx fishing.mdx farming.mdx smithing.mdx cooking.mdx alchemy.mdx
```

- [ ] **Step 6: Verify the tree shape**

Run: `cd /Users/alappatel/Documents/GitHub/kbve-professiondb-mapdb-link && find apps/kbve/astro-kbve/src/content/docs/professiondb -name '*.mdx' | sort`
Expected: `index.mdx` (top-level) + 7 `<profession>/index.mdx` + 14 `<profession>/<action>.mdx` = 22 files.

- [ ] **Step 7: Commit**

```bash
git add apps/kbve/astro-kbve/src/content/docs/professiondb
git commit -m "refactor(professiondb): folder per profession, file per action"
```

---

### Task 4: Rewrite `gen-professiondb-data.mjs` for nested assembly

**Files:**

- Modify: `packages/data/codegen/gen-professiondb-data.mjs`

**Interfaces:**

- Consumes: the nested MDX tree (Task 3). Reads every `*.mdx`, splits by `kind`.
- Produces: same `professiondb-data.json` / `.binpb` as before (proto-canonical `{ professions: [...] }`), each profession's `actions[]` assembled from its action files. Authoring-only keys (`kind`, `profession`, `title`) stripped before proto encode. Fails loudly on `folder != profession`, duplicate action `ref`/`key`, or an action whose `profession` has no `index.mdx`.

- [ ] **Step 1: Replace `loadProfessionsFromMdx` with a recursive, grouped loader**

In `packages/data/codegen/gen-professiondb-data.mjs`, add `readdirSync`/`statSync` recursion and replace the loader. Add `'kind'` and `'profession'` to `ASTRO_ONLY_FIELDS` so they are stripped like `title`:

```js
const ASTRO_ONLY_FIELDS = new Set(['title', 'kind', 'profession']);
```

Replace `loadProfessionsFromMdx` with:

```js
import { readdirSync, statSync } from 'node:fs';

function walkMdx(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const full = resolve(dir, name);
		if (statSync(full).isDirectory()) {
			out.push(...walkMdx(full));
		} else if (name.endsWith('.mdx')) {
			out.push(full);
		}
	}
	return out;
}

function loadProfessionsFromMdx() {
	const files = walkMdx(professiondbDir);
	const professions = new Map();
	const actionsByProfession = new Map();
	const seenActionRefs = new Set();
	const seenActionKeys = new Set();

	for (const full of files) {
		const { data } = matter(readFileSync(full, 'utf8'));
		if (data.drafted === true) continue;
		const folder = full.split('/').slice(-2, -1)[0];

		if (data.kind === 'profession') {
			if (!data.id || !data.ref || !data.name) continue;
			professions.set(data.ref, transform(data));
		} else if (data.kind === 'action') {
			if (data.profession !== folder) {
				throw new Error(
					`professiondb: action ${data.ref} has profession='${data.profession}' but lives in folder '${folder}'`,
				);
			}
			if (seenActionRefs.has(data.ref)) {
				throw new Error(
					`professiondb: duplicate action ref '${data.ref}'`,
				);
			}
			if (seenActionKeys.has(data.key)) {
				throw new Error(
					`professiondb: duplicate action key '${data.key}'`,
				);
			}
			seenActionRefs.add(data.ref);
			seenActionKeys.add(data.key);
			const list = actionsByProfession.get(data.profession) ?? [];
			list.push(transform(data));
			actionsByProfession.set(data.profession, list);
		}
	}

	for (const [profRef, actions] of actionsByProfession) {
		const prof = professions.get(profRef);
		if (!prof) {
			throw new Error(
				`professiondb: actions reference profession '${profRef}' with no index.mdx`,
			);
		}
		actions.sort((a, b) => a.key - b.key);
		prof.actions = actions;
	}

	return [...professions.values()];
}
```

Note: `transform` already runs `snakeToCamel` + enum-prefixing recursively; the top-level `index.mdx` placeholder is `drafted` and skipped. `folder` for the top-level `index.mdx` is `professiondb` (its parent dir), and it is `drafted`, so it is skipped before the folder check.

- [ ] **Step 2: Run the data-gen and confirm assembly**

Run: `cd /Users/alappatel/Documents/GitHub/kbve-professiondb-mapdb-link && export NX_WORKSPACE_ROOT_PATH=$PWD && npx tsx packages/data/codegen/gen-professiondb-data.mjs 2>&1 | grep -v "npm warn"`
Expected: `Loaded 7 profession defs from MDX` and the binpb byte count printed, no throw.

- [ ] **Step 3: Assert each profession has its actions assembled with keys**

Run:

```bash
cd /Users/alappatel/Documents/GitHub/kbve-professiondb-mapdb-link && node -e "
const d=require('./packages/data/codegen/generated/professiondb-data.json');
const total=d.professions.reduce((n,p)=>n+(p.actions?.length||0),0);
const alch=d.professions.find(p=>p.ref==='alchemy');
console.log('professions',d.professions.length,'| total actions',total);
console.log('alchemy actions',alch.actions.map(a=>a.ref+':'+a.key).join(','));
"
```

Expected: `professions 7 | total actions 14` and `alchemy actions brew-attack-potion:13,brew-health-potion:14`.

- [ ] **Step 4: Assert the folder-mismatch guard fires**

Temporarily edit one action file's `profession:` to a wrong value, run the gen, confirm it throws with the mismatch message, then revert.

Run (after temp edit): `npx tsx packages/data/codegen/gen-professiondb-data.mjs 2>&1 | grep -i "profession=" || echo "GUARD DID NOT FIRE"`
Expected: the mismatch error line. Revert the edit afterward.

- [ ] **Step 5: Commit**

```bash
git add packages/data/codegen/gen-professiondb-data.mjs packages/data/codegen/generated/professiondb-data.json packages/data/codegen/generated/professiondb-data.binpb
git commit -m "feat(professiondb): assemble derived actions[] from nested action files"
```

---

### Task 5: Cross-ref validator + `xref-index` emitter (warn-only)

**Files:**

- Create: `packages/data/codegen/gen-professiondb-xref.mjs`
- Create (output): `packages/data/codegen/generated/xref-index.json`

**Interfaces:**

- Consumes: `generated/professiondb-data.json` (Task 4) and `generated/itemdb-data.json` (existing). Needs an item ref→key map from itemdb data.
- Produces: `generated/xref-index.json` — `{ content_version, produced_by, input_to, tool_for }` where each map is `{ [itemKey]: number[] }` (arrays of action keys). Unresolved item refs are **logged as warnings**, never fatal this phase. Also emits a `slug_to_key` map for tooling.

- [ ] **Step 1: Confirm itemdb-data.json exists + its shape**

Run: `cd /Users/alappatel/Documents/GitHub/kbve-professiondb-mapdb-link && node -e "const d=require('./packages/data/codegen/generated/itemdb-data.json'); const arr=d.items||d.objects||Object.values(d)[0]; console.log(Object.keys(d)); console.log('sample', JSON.stringify(arr[0]&&{ref:arr[0].ref,key:arr[0].key}));"`
Expected: prints the top-level key (e.g. `items`) and a sample `{ref, key}`. If `itemdb-data.json` is absent, first run `npx tsx packages/data/codegen/gen-itemdb-data.mjs`. Use the discovered top-level key name in Step 2 (assume `items` below; adjust if different).

- [ ] **Step 2: Write the xref generator**

Create `packages/data/codegen/gen-professiondb-xref.mjs`:

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const generatedDir = resolve(__dirname, 'generated');
const itemdbPath = resolve(generatedDir, 'itemdb-data.json');
const professiondbPath = resolve(generatedDir, 'professiondb-data.json');
const outPath = resolve(generatedDir, 'xref-index.json');

const CONTENT_VERSION = 'phase1';

function main() {
	const items = JSON.parse(readFileSync(itemdbPath, 'utf8')).items ?? [];
	const professions =
		JSON.parse(readFileSync(professiondbPath, 'utf8')).professions ?? [];

	const itemKeyByRef = new Map();
	for (const it of items) itemKeyByRef.set(it.ref, it.key);

	const producedBy = {};
	const inputTo = {};
	const toolFor = {};
	const warnings = [];

	const add = (map, itemRef, actionKey, relation) => {
		const itemKey = itemKeyByRef.get(itemRef);
		if (itemKey === undefined) {
			warnings.push(`${relation}: item '${itemRef}' not in itemdb`);
			return;
		}
		(map[itemKey] ??= []).push(actionKey);
	};

	for (const prof of professions) {
		for (const action of prof.actions ?? []) {
			for (const o of action.outputs ?? [])
				add(producedBy, o.itemRef, action.key, 'produced_by');
			for (const i of action.inputs ?? [])
				add(inputTo, i.itemRef, action.key, 'input_to');
			for (const t of action.toolRefs ?? [])
				add(toolFor, t, action.key, 'tool_for');
		}
	}

	const index = {
		content_version: CONTENT_VERSION,
		slug_to_key: Object.fromEntries(itemKeyByRef),
		produced_by: producedBy,
		input_to: inputTo,
		tool_for: toolFor,
	};
	writeFileSync(outPath, JSON.stringify(index, null, 2));
	console.log(`Wrote ${outPath}`);
	console.log(
		`produced_by=${Object.keys(producedBy).length} input_to=${Object.keys(inputTo).length} tool_for=${Object.keys(toolFor).length}`,
	);
	if (warnings.length) {
		console.warn(`\n[xref warn-only] ${warnings.length} unresolved refs:`);
		for (const w of warnings) console.warn(`  ⚠ ${w}`);
	}
	console.log('\n[xref] warn-only mode — build not failed.');
}

main();
```

Note: professiondb-data.json is proto-canonical (camelCase), so action fields are `outputs`/`inputs`/`toolRefs` and item refs are `itemRef`. Adjust the itemdb top-level key from Step 1 if it is not `items`.

- [ ] **Step 3: Run it — expect warnings, exit 0**

Run: `cd /Users/alappatel/Documents/GitHub/kbve-professiondb-mapdb-link && export NX_WORKSPACE_ROOT_PATH=$PWD && npx tsx packages/data/codegen/gen-professiondb-xref.mjs; echo "exit=$?"`
Expected: `Wrote .../xref-index.json`, a warn list for the ~26 missing seed refs (copper-ore/iron-ore resolve), and `exit=0`.

- [ ] **Step 4: Assert the resolved edges are keyed correctly**

Run:

```bash
cd /Users/alappatel/Documents/GitHub/kbve-professiondb-mapdb-link && node -e "
const x=require('./packages/data/codegen/generated/xref-index.json');
const copper=x.slug_to_key['copper-ore'];
console.log('copper-ore key', copper, '-> produced_by actions', x.produced_by[copper]);
console.log('content_version', x.content_version);
"
```

Expected: `copper-ore` resolves to its itemdb key and `produced_by[thatKey]` includes action key `1` (mine-copper-ore). `content_version phase1`.

- [ ] **Step 5: Commit**

```bash
git add packages/data/codegen/gen-professiondb-xref.mjs packages/data/codegen/generated/xref-index.json
git commit -m "feat(professiondb): cross-ref validator + xref-index emitter (warn-only)"
```

---

### Task 6: Wire pipeline + barrel + astro sync verification

**Files:**

- Modify: `packages/data/codegen/professiondb.ts` (expose xref lookups)
- Modify: `packages/data/codegen/gen-professiondb-data.mjs` (optional: chain xref at the end) — OR document manual order
- Verify: `nx run astro-kbve:sync`

**Interfaces:**

- Consumes: `generated/xref-index.json` (Task 5).
- Produces: barrel helpers `loadXrefIndex()`, `getActionsProducing(itemKey)`, `getActionsUsing(itemKey)`, `getActionsForTool(itemKey)` — O(1) reads over the baked index.

- [ ] **Step 1: Add xref accessors to the barrel**

Append to `packages/data/codegen/professiondb.ts`:

```ts
import rawXref from './generated/xref-index.json';

type XrefIndex = {
	content_version: string;
	slug_to_key: Record<string, number>;
	produced_by: Record<string, number[]>;
	input_to: Record<string, number[]>;
	tool_for: Record<string, number[]>;
};

export function loadXrefIndex(): XrefIndex {
	return rawXref as XrefIndex;
}

export function getActionsProducing(itemKey: number): number[] {
	return (rawXref as XrefIndex).produced_by[String(itemKey)] ?? [];
}

export function getActionsUsing(itemKey: number): number[] {
	return (rawXref as XrefIndex).input_to[String(itemKey)] ?? [];
}

export function getActionsForTool(itemKey: number): number[] {
	return (rawXref as XrefIndex).tool_for[String(itemKey)] ?? [];
}
```

- [ ] **Step 2: Round-trip the barrel accessors**

Run:

```bash
cd /Users/alappatel/Documents/GitHub/kbve-professiondb-mapdb-link && export NX_WORKSPACE_ROOT_PATH=$PWD && npx tsx -e "
import { loadProfessions, loadXrefIndex, getActionsProducing } from './packages/data/codegen/professiondb.ts';
const profs = loadProfessions();
const x = loadXrefIndex();
const copperKey = x.slug_to_key['copper-ore'];
console.log('professions', profs.length, '| xref version', x.content_version);
console.log('actions producing copper-ore', getActionsProducing(copperKey));
" 2>&1 | grep -v "npm warn"
```

Expected: `professions 7 | xref version phase1` and `actions producing copper-ore [ 1 ]`.

- [ ] **Step 3: Astro sync — the full collection gate**

Run: `cd /Users/alappatel/Documents/GitHub/kbve-professiondb-mapdb-link && export NX_WORKSPACE_ROOT_PATH=$PWD && ./kbve.sh -nx astro-kbve:sync 2>&1 | tail -6`
Expected: `Synced content` + `Successfully ran target sync`. This proves the discriminated union validates all 22 files (7 profession indexes + 14 actions + top-level placeholder).

- [ ] **Step 4: Commit**

```bash
git add packages/data/codegen/professiondb.ts
git commit -m "feat(professiondb): barrel xref accessors (O(1) item->action lookups)"
```

- [ ] **Step 5: Push + open PR to dev**

```bash
cd /Users/alappatel/Documents/GitHub/kbve-professiondb-mapdb-link
git push -u origin trunk/professiondb-mapdb-link-1785228003
gh pr create --base dev --head trunk/professiondb-mapdb-link-1785228003 \
  --title "feat(professiondb): Phase 1 — folder/action restructure + xref validator (warn)" \
  --body "Phase 1 of the skilling-unification spec (docs/superpowers/specs/2026-07-28-professiondb-skilling-unification-design.md). Restructures professiondb to folder-per-profession / file-per-action, adds key+facility_ref to ProfessionAction, derived-actions assembly, and the cross-ref validator + xref-index emitter in warn-only mode. No itemdb/mapdb changes yet (Phases 2-4)."
```

---

## Self-Review

- **Spec coverage (Phase 1 slice):** restructure to folders ✓ (T3), discriminated-union schema ✓ (T2), derived `actions[]` + folder==profession assertion ✓ (T4), `facility_ref` ✓ (T1), `key` for xref ✓ (T1), cross-ref validator + `xref-index` keyed on `key` + `content_version`, warn-only ✓ (T5), barrel O(1) accessors ✓ (T6). Deferred to later phases by design: reserved fields, mapdb changes, itemdb item authoring, migration of 29 skilling blocks, graph-integrity (cycles/orphans), hard-fail flip, UE swap.
- **Type consistency:** `ProfessionAction.key` (T1) is the join used in T5 (`action.key`) and read in T6. itemdb ref→key map named `itemKeyByRef`/`slug_to_key` consistently. `IProfessionEntrySchema` (T2) is the collection schema referenced in T2 Step 4. Data-gen strips `kind`/`profession`/`title` (T4 Step 1) so proto encode is unaffected.
- **Open assumption flagged in-plan:** itemdb-data.json top-level key (`items`) is verified in T5 Step 1 before use — adjust if different. This is the only unknown and it is checked, not guessed.
