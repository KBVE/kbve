# Palworld PalSchema Shops — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author Palworld shop data as MDX frontmatter (source of truth) and generate a committed PalSchema JSON overlay the game server loads, shipping one shop (`Village_Shop_1`) end-to-end.

**Architecture:** One `palshop:` frontmatter block per shop MDX → a dependency-free Node generator expands it to `DT_ItemShopCreateData` JSON in the PalSchema overlay dir (committed); the same frontmatter renders on the astro-kbve site via a zod-typed collection field + an Astro table component. Data-only — no server runtime code, no crash surface.

**Tech Stack:** Node (built-ins only for the generator/validator — the worktree has no node_modules), Astro/Starlight content collections, `astro/zod`, PalSchema (JSON data tables), nx `run-commands`.

## Global Constraints

- **Generator + validator use ONLY Node built-ins** (`node:fs`, `node:path`, `node:url`, `node:test`, `node:assert`). No `yaml`, no `zod`, no third-party imports — the worktree has no node_modules, and these must run under bare `node`.
- **MDX frontmatter is the source of truth.** `kbve-shops.json` is generated-only; never hand-edit it.
- **Content is KBVE-authored.** Hex Reworked Shop (Nexus) is a structural reference only; no verbatim third-party data.
- **Item shape (PalSchema):** `{ StaticItemId, ProductType, OverridePrice, ProductNum, Stock }`; `ProductType` = `EPalItemShopProductType::<Type>`; Phase 1 only `Normal`.
- **Known shop rows (the only valid `shopId` values):** `Village_Shop_1`, `Desert_Shop_1`, `Desert_Shop_2`, `Volcano_Shop_1`, `Volcano_Shop_2`, `Wander_Shop_1`, `Bounty_Shop_1`, `Medal_Shop_1`.
- **Generated artifact path:** `apps/agones/palworld/mods/PalSchema/mods/KBVEShops/raw/kbve-shops.json` (resolved from `import.meta.url`, not raw cwd).
- **Output JSON:** 4-space indent, shops sorted by `shopId`, item order preserved, trailing newline — stable diffs.
- **Deploy:** committed JSON → image rebuild → Agones GameServer recreate (template immutable). Version bump is MDX-only.
- The zod schema + Astro render verify in CI (`astro build`), not in this worktree (no node_modules). The generator/validator + their tests run locally under `node --test`.

---

### Task 1: Dependency-free shop generator core

**Files:**
- Create: `apps/kbve/astro-kbve/scripts/generate-palworld-shops.mjs`
- Test: `apps/kbve/astro-kbve/scripts/generate-palworld-shops.test.mjs`

**Interfaces:**
- Produces (named exports used by Task 2 and the tests):
  - `extractFrontmatter(mdxText: string) -> string | null` — the text between the leading `---` fences.
  - `parsePalshop(frontmatter: string) -> { shopId: string, action: string, items: RawItem[] }` where `RawItem = { id, type, price, num, stock }`.
  - `expandItem(raw: RawItem) -> { StaticItemId, ProductType, OverridePrice, ProductNum, Stock }`.
  - `buildTable(shops: ParsedShop[]) -> object` — the full `{ DT_ItemShopCreateData: {...} }`.
  - `KNOWN_SHOPS: string[]`.
- Consumes: nothing (first task).

- [ ] **Step 1: Write the failing test**

Create `apps/kbve/astro-kbve/scripts/generate-palworld-shops.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	extractFrontmatter,
	parsePalshop,
	expandItem,
	buildTable,
	KNOWN_SHOPS,
} from './generate-palworld-shops.mjs';

const MDX = `---
title: Village Shop
palshop:
    shopId: Village_Shop_1
    action: Clear
    items:
        - { id: PalSphere, type: Normal, price: 100, num: 1, stock: 0 }
        - { id: Medicines, type: Normal, price: 200, num: 2, stock: 5 }
---

import PalShopTable from '@/components/palworld/PalShopTable.astro';

<PalShopTable shop={frontmatter.palshop} />
`;

test('extractFrontmatter returns the fenced block', () => {
	const fm = extractFrontmatter(MDX);
	assert.ok(fm.includes('shopId: Village_Shop_1'));
	assert.ok(!fm.includes('PalShopTable'));
});

test('parsePalshop reads shopId, action, and items', () => {
	const p = parsePalshop(extractFrontmatter(MDX));
	assert.equal(p.shopId, 'Village_Shop_1');
	assert.equal(p.action, 'Clear');
	assert.deepEqual(p.items, [
		{ id: 'PalSphere', type: 'Normal', price: 100, num: 1, stock: 0 },
		{ id: 'Medicines', type: 'Normal', price: 200, num: 2, stock: 5 },
	]);
});

test('expandItem maps to the PalSchema field shape', () => {
	assert.deepEqual(
		expandItem({ id: 'PalSphere', type: 'Normal', price: 100, num: 1, stock: 0 }),
		{
			StaticItemId: 'PalSphere',
			ProductType: 'EPalItemShopProductType::Normal',
			OverridePrice: 100,
			ProductNum: 1,
			Stock: 0,
		},
	);
});

test('buildTable nests rows under DT_ItemShopCreateData and sorts by shopId', () => {
	const table = buildTable([
		{ shopId: 'Volcano_Shop_1', action: 'Clear', items: [{ id: 'A', type: 'Normal', price: 1, num: 1, stock: 0 }] },
		{ shopId: 'Desert_Shop_1', action: 'Clear', items: [{ id: 'B', type: 'Normal', price: 2, num: 1, stock: 0 }] },
	]);
	assert.deepEqual(Object.keys(table.DT_ItemShopCreateData), ['Desert_Shop_1', 'Volcano_Shop_1']);
	const v = table.DT_ItemShopCreateData.Volcano_Shop_1.productDataArray;
	assert.equal(v.Action, 'Clear');
	assert.equal(v.Items[0].StaticItemId, 'A');
});

test('KNOWN_SHOPS contains the eight rows', () => {
	assert.equal(KNOWN_SHOPS.length, 8);
	assert.ok(KNOWN_SHOPS.includes('Village_Shop_1'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/kbve/astro-kbve && node --test scripts/generate-palworld-shops.test.mjs`
Expected: FAIL — `Cannot find module './generate-palworld-shops.mjs'` (or missing exports).

- [ ] **Step 3: Write the generator**

Create `apps/kbve/astro-kbve/scripts/generate-palworld-shops.mjs`:

```js
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const PALSHOP_DIR = join(PROJECT_ROOT, 'src/content/docs/palworld/palshop');
const OUTPUT = resolve(
	PROJECT_ROOT,
	'../../agones/palworld/mods/PalSchema/mods/KBVEShops/raw/kbve-shops.json',
);

export const KNOWN_SHOPS = [
	'Village_Shop_1',
	'Desert_Shop_1',
	'Desert_Shop_2',
	'Volcano_Shop_1',
	'Volcano_Shop_2',
	'Wander_Shop_1',
	'Bounty_Shop_1',
	'Medal_Shop_1',
];

export function extractFrontmatter(mdxText) {
	const m = mdxText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	return m ? m[1] : null;
}

function parseScalar(raw) {
	const v = raw.trim().replace(/^["']|["']$/g, '');
	if (/^-?\d+$/.test(v)) return Number(v);
	return v;
}

function parseFlowItem(inner) {
	const out = {};
	for (const pair of inner.split(',')) {
		const idx = pair.indexOf(':');
		if (idx === -1) continue;
		const key = pair.slice(0, idx).trim();
		out[key] = parseScalar(pair.slice(idx + 1));
	}
	return {
		id: out.id,
		type: out.type,
		price: out.price,
		num: out.num,
		stock: out.stock,
	};
}

export function parsePalshop(frontmatter) {
	const lines = frontmatter.split(/\r?\n/);
	const start = lines.findIndex((l) => /^palshop:\s*$/.test(l));
	if (start === -1) throw new Error('no palshop: block in frontmatter');

	let shopId, action;
	const items = [];
	for (let i = start + 1; i < lines.length; i++) {
		const line = lines[i];
		if (/^\S/.test(line)) break; // dedent to a new top-level key
		const shop = line.match(/^\s+shopId:\s*(\S+)\s*$/);
		if (shop) { shopId = shop[1]; continue; }
		const act = line.match(/^\s+action:\s*(\S+)\s*$/);
		if (act) { action = act[1]; continue; }
		const item = line.match(/^\s*-\s*\{(.+)\}\s*$/);
		if (item) items.push(parseFlowItem(item[1]));
	}
	if (!shopId) throw new Error('palshop block missing shopId');
	return { shopId, action, items };
}

export function expandItem(raw) {
	return {
		StaticItemId: raw.id,
		ProductType: `EPalItemShopProductType::${raw.type}`,
		OverridePrice: raw.price,
		ProductNum: raw.num,
		Stock: raw.stock,
	};
}

export function buildTable(shops) {
	const rows = {};
	for (const s of [...shops].sort((a, b) => a.shopId.localeCompare(b.shopId))) {
		rows[s.shopId] = {
			productDataArray: {
				Action: s.action,
				Items: s.items.map(expandItem),
			},
		};
	}
	return { DT_ItemShopCreateData: rows };
}

async function main() {
	const files = (await readdir(PALSHOP_DIR)).filter((f) => f.endsWith('.mdx'));
	const shops = [];
	for (const f of files) {
		const text = await readFile(join(PALSHOP_DIR, f), 'utf-8');
		const fm = extractFrontmatter(text);
		if (!fm || !/^palshop:\s*$/m.test(fm)) continue;
		shops.push(parsePalshop(fm));
	}
	const table = buildTable(shops);
	await mkdir(dirname(OUTPUT), { recursive: true });
	await writeFile(OUTPUT, JSON.stringify(table, null, 4) + '\n', 'utf-8');
	console.log(`[palworld-shops] wrote ${shops.length} shop(s) -> ${OUTPUT}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/kbve/astro-kbve && node --test scripts/generate-palworld-shops.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/kbve/astro-kbve/scripts/generate-palworld-shops.mjs apps/kbve/astro-kbve/scripts/generate-palworld-shops.test.mjs
git commit -m "feat(palworld-shops): dependency-free MDX->PalSchema shop generator core"
```

---

### Task 2: Shop frontmatter validator

**Files:**
- Create: `apps/kbve/astro-kbve/scripts/validate-palworld-shops.mjs`
- Test: `apps/kbve/astro-kbve/scripts/validate-palworld-shops.test.mjs`

**Interfaces:**
- Consumes: `parsePalshop`, `extractFrontmatter`, `KNOWN_SHOPS` from Task 1.
- Produces: `validateShop(parsed) -> string[]` (list of error messages; empty = valid) and `PRODUCT_TYPES: string[]`.

- [ ] **Step 1: Write the failing test**

Create `apps/kbve/astro-kbve/scripts/validate-palworld-shops.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateShop } from './validate-palworld-shops.mjs';

const good = {
	shopId: 'Village_Shop_1',
	action: 'Clear',
	items: [{ id: 'PalSphere', type: 'Normal', price: 100, num: 1, stock: 0 }],
};

test('valid shop returns no errors', () => {
	assert.deepEqual(validateShop(good), []);
});

test('unknown shopId is rejected', () => {
	const errs = validateShop({ ...good, shopId: 'Nope_Shop_9' });
	assert.ok(errs.some((e) => e.includes('unknown shopId')));
});

test('unknown action is rejected', () => {
	assert.ok(validateShop({ ...good, action: 'Append' }).some((e) => e.includes('action')));
});

test('empty items is rejected', () => {
	assert.ok(validateShop({ ...good, items: [] }).some((e) => e.includes('items')));
});

test('bad product type is rejected', () => {
	const errs = validateShop({ ...good, items: [{ id: 'X', type: 'Weird', price: 1, num: 1, stock: 0 }] });
	assert.ok(errs.some((e) => e.includes('type')));
});

test('non-integer / out-of-range fields are rejected', () => {
	assert.ok(validateShop({ ...good, items: [{ id: 'X', type: 'Normal', price: -1, num: 1, stock: 0 }] }).some((e) => e.includes('price')));
	assert.ok(validateShop({ ...good, items: [{ id: 'X', type: 'Normal', price: 1, num: 0, stock: 0 }] }).some((e) => e.includes('num')));
	assert.ok(validateShop({ ...good, items: [{ id: '', type: 'Normal', price: 1, num: 1, stock: 0 }] }).some((e) => e.includes('id')));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/kbve/astro-kbve && node --test scripts/validate-palworld-shops.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the validator**

Create `apps/kbve/astro-kbve/scripts/validate-palworld-shops.mjs`:

```js
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFrontmatter, parsePalshop, KNOWN_SHOPS } from './generate-palworld-shops.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PALSHOP_DIR = resolve(__dirname, '../src/content/docs/palworld/palshop');

export const PRODUCT_TYPES = ['Normal'];
const ACTIONS = ['Clear'];

function isNonNegInt(n) { return Number.isInteger(n) && n >= 0; }

export function validateShop(shop) {
	const errs = [];
	if (!KNOWN_SHOPS.includes(shop.shopId)) errs.push(`unknown shopId: ${shop.shopId}`);
	if (!ACTIONS.includes(shop.action)) errs.push(`invalid action: ${shop.action}`);
	if (!Array.isArray(shop.items) || shop.items.length === 0) {
		errs.push('items must be a non-empty list');
		return errs;
	}
	shop.items.forEach((it, i) => {
		const at = `item[${i}]`;
		if (typeof it.id !== 'string' || it.id.length === 0) errs.push(`${at} id must be a non-empty string`);
		if (!PRODUCT_TYPES.includes(it.type)) errs.push(`${at} type must be one of ${PRODUCT_TYPES.join(',')}`);
		if (!isNonNegInt(it.price)) errs.push(`${at} price must be a non-negative integer`);
		if (!Number.isInteger(it.num) || it.num < 1) errs.push(`${at} num must be an integer >= 1`);
		if (!isNonNegInt(it.stock)) errs.push(`${at} stock must be a non-negative integer`);
	});
	return errs;
}

async function main() {
	const files = (await readdir(PALSHOP_DIR)).filter((f) => f.endsWith('.mdx'));
	let failed = false;
	const seen = new Set();
	for (const f of files) {
		const fm = extractFrontmatter(await readFile(join(PALSHOP_DIR, f), 'utf-8'));
		if (!fm || !/^palshop:\s*$/m.test(fm)) continue;
		let shop;
		try {
			shop = parsePalshop(fm);
		} catch (e) {
			console.error(`[${f}] parse error: ${e.message}`);
			failed = true;
			continue;
		}
		if (seen.has(shop.shopId)) { console.error(`[${f}] duplicate shopId: ${shop.shopId}`); failed = true; }
		seen.add(shop.shopId);
		for (const e of validateShop(shop)) { console.error(`[${f}] ${e}`); failed = true; }
	}
	if (failed) process.exit(1);
	console.log('[palworld-shops] validation passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/kbve/astro-kbve && node --test scripts/validate-palworld-shops.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/kbve/astro-kbve/scripts/validate-palworld-shops.mjs apps/kbve/astro-kbve/scripts/validate-palworld-shops.test.mjs
git commit -m "feat(palworld-shops): frontmatter validator (shape + enum + range gates)"
```

---

### Task 3: Village shop MDX + generated artifact

**Files:**
- Create: `apps/kbve/astro-kbve/src/content/docs/palworld/palshop/village.mdx`
- Create (generated): `apps/agones/palworld/mods/PalSchema/mods/KBVEShops/raw/kbve-shops.json`

**Interfaces:**
- Consumes: the generator + validator from Tasks 1–2. The `<PalShopTable>` import resolves in Task 5 (CI build); the generator does not need it.

- [ ] **Step 1: Author the Village MDX**

Create `apps/kbve/astro-kbve/src/content/docs/palworld/palshop/village.mdx`. Item ids are real Palworld shop ids (from the Hex reference); prices are KBVE-authored. `stock: 0` = unlimited.

```mdx
---
title: Village Shop
template: splash
description: The KBVE Palworld Village shop — starter spheres, armor, and supplies.
sidebar:
    label: Village Shop
    order: 2
tags:
    - palworld
    - shop
palshop:
    shopId: Village_Shop_1
    action: Clear
    items:
        - { id: PalSphere, type: Normal, price: 100, num: 1, stock: 0 }
        - { id: PalSphere_Mega, type: Normal, price: 800, num: 1, stock: 0 }
        - { id: Shield_01, type: Normal, price: 300, num: 1, stock: 0 }
        - { id: ClothArmorCold, type: Normal, price: 500, num: 1, stock: 0 }
        - { id: ClothArmorHeat, type: Normal, price: 500, num: 1, stock: 0 }
        - { id: Herbs, type: Normal, price: 50, num: 1, stock: 0 }
        - { id: Medicines, type: Normal, price: 200, num: 1, stock: 0 }
        - { id: LuxuryMedicines, type: Normal, price: 1000, num: 1, stock: 0 }
---

import PalShopTable from '@/components/palworld/PalShopTable.astro';

The **Village Shop** stocks starter gear for new arrivals — capture spheres,
climate armor, and healing supplies at fixed prices.

<PalShopTable shop={frontmatter.palshop} />
```

- [ ] **Step 2: Run the validator (expect pass)**

Run: `cd apps/kbve/astro-kbve && node scripts/validate-palworld-shops.mjs`
Expected: `[palworld-shops] validation passed`, exit 0.

- [ ] **Step 3: Run the generator**

Run: `cd apps/kbve/astro-kbve && node scripts/generate-palworld-shops.mjs`
Expected: `[palworld-shops] wrote 1 shop(s) -> …/KBVEShops/raw/kbve-shops.json`.

- [ ] **Step 4: Verify the generated JSON shape**

Run:
```bash
cd apps/kbve/astro-kbve && node -e "const t=require('../../agones/palworld/mods/PalSchema/mods/KBVEShops/raw/kbve-shops.json'); const p=t.DT_ItemShopCreateData.Village_Shop_1.productDataArray; console.log(p.Action, p.Items.length, p.Items[0].StaticItemId, p.Items[0].ProductType); if(p.Action!=='Clear'||p.Items.length!==8||p.Items[0].ProductType!=='EPalItemShopProductType::Normal') process.exit(1)"
```
Expected: `Clear 8 PalSphere EPalItemShopProductType::Normal`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/kbve/astro-kbve/src/content/docs/palworld/palshop/village.mdx apps/agones/palworld/mods/PalSchema/mods/KBVEShops/raw/kbve-shops.json
git commit -m "feat(palworld-shops): Village shop MDX + generated KBVEShops overlay"
```

---

### Task 4: Zod schema + content-collection registration

**Files:**
- Create: `apps/kbve/astro-kbve/src/data/schema/palworld/shops.ts`
- Create: `apps/kbve/astro-kbve/src/data/schema/palworld/index.ts`
- Modify: `apps/kbve/astro-kbve/src/data/schema/index.ts`
- Modify: `apps/kbve/astro-kbve/src/content.config.ts`

**Interfaces:**
- Produces: `PalShopSchema` (and `PalShopItem` type) for the `docs` collection `extend` block and Task 5's component props.
- Note: this task's verification is `astro build` in CI (no node_modules locally). Local check is a code review that field names match the generator's authoring shape (`id/type/price/num/stock`, `shopId/action/items`).

- [ ] **Step 1: Write the schema**

Create `apps/kbve/astro-kbve/src/data/schema/palworld/shops.ts`:

```ts
import { z } from 'astro/zod';

export const PalShopProductTypeSchema = z.enum(['Normal']);

export const PalShopItemSchema = z.object({
	id: z.string().min(1),
	type: PalShopProductTypeSchema.default('Normal'),
	price: z.number().int().nonnegative().default(0),
	num: z.number().int().positive().default(1),
	stock: z.number().int().nonnegative().default(0),
});
export type PalShopItem = z.infer<typeof PalShopItemSchema>;

export const PalShopSchema = z.object({
	shopId: z.string().min(1),
	action: z.enum(['Clear']).default('Clear'),
	items: z.array(PalShopItemSchema).min(1),
});
export type PalShop = z.infer<typeof PalShopSchema>;
```

- [ ] **Step 2: Re-export from the palworld and root schema indexes**

Create `apps/kbve/astro-kbve/src/data/schema/palworld/index.ts`:

```ts
export * from './shops';
```

Add to `apps/kbve/astro-kbve/src/data/schema/index.ts` (after the `export * from './mc';` line):

```ts
export * from './palworld';
```

- [ ] **Step 3: Register the field in the docs collection**

In `apps/kbve/astro-kbve/src/content.config.ts`:

Add `PalShopSchema` to the existing import from `@/data/schema` (the block that already imports `MCItemSchema`, `OSRSExtendedSchema`, etc.):

```ts
	PalShopSchema,
```

Add the field inside the `docsSchema({ extend: z.object({ … }) })` block, next to the `mc_*` fields:

```ts
				palshop: PalShopSchema.optional(),
```

- [ ] **Step 4: Verify (review-only locally; build in CI)**

Local: confirm by reading that `palshop` is present in the `extend` object and `PalShopSchema` is imported and exported through both index files. There is no local build (no node_modules).
CI expectation: `astro build` type-checks the collection; `entry.data.palshop` is now typed and preserved (not stripped).

- [ ] **Step 5: Commit**

```bash
git add apps/kbve/astro-kbve/src/data/schema/palworld apps/kbve/astro-kbve/src/data/schema/index.ts apps/kbve/astro-kbve/src/content.config.ts
git commit -m "feat(palworld-shops): PalShop zod schema + docs collection registration"
```

---

### Task 5: PalShopTable render component

**Files:**
- Create: `apps/kbve/astro-kbve/src/components/palworld/PalShopTable.astro`

**Interfaces:**
- Consumes: `PalShop` type from Task 4; receives `shop={frontmatter.palshop}` from the MDX (Task 3).

- [ ] **Step 1: Write the component**

Create `apps/kbve/astro-kbve/src/components/palworld/PalShopTable.astro`:

```astro
---
import type { PalShop } from '@/data/schema';

interface Props {
	shop: PalShop;
}

const { shop } = Astro.props;
const priceLabel = (p: number) => (p === 0 ? 'Free' : `${p.toLocaleString()} G`);
const stockLabel = (s: number) => (s === 0 ? 'Unlimited' : String(s));
---

<div class="palshop">
	<div class="palshop__meta">
		<span class="palshop__id">{shop.shopId}</span>
		<span class="palshop__count">{shop.items.length} items</span>
	</div>
	<table class="palshop__table">
		<thead>
			<tr><th>Item</th><th>Price</th><th>Qty</th><th>Stock</th></tr>
		</thead>
		<tbody>
			{shop.items.map((it) => (
				<tr>
					<td>{it.id}</td>
					<td>{priceLabel(it.price)}</td>
					<td>{it.num}</td>
					<td>{stockLabel(it.stock)}</td>
				</tr>
			))}
		</tbody>
	</table>
</div>

<style>
	.palshop { margin: 1rem 0; }
	.palshop__meta { display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.5rem; font-size: 0.85rem; opacity: 0.8; }
	.palshop__id { font-family: var(--sl-font-mono, monospace); }
	.palshop__table { width: 100%; border-collapse: collapse; }
	.palshop__table th, .palshop__table td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--sl-color-gray-5); }
	.palshop__table th { font-weight: 600; }
</style>
```

- [ ] **Step 2: Verify (review-only locally; build in CI)**

Local: confirm the component reads `Astro.props.shop` and only references fields present on `PalShop` (`shopId`, `items[].id/price/num/stock`). No local render (no node_modules).
CI expectation: `astro build` renders `/palworld/palshop/village/` with the static table.

- [ ] **Step 3: Commit**

```bash
git add apps/kbve/astro-kbve/src/components/palworld/PalShopTable.astro
git commit -m "feat(palworld-shops): PalShopTable static render component"
```

---

### Task 6: nx target, overlay wiring, attribution, version bump

**Files:**
- Modify: `apps/kbve/astro-kbve/project.json`
- Modify: `apps/agones/palworld/mods/PalSchema/README.md`
- Verify (no edit expected): `apps/agones/palworld/overlay.sh`
- Modify: `apps/kbve/astro-kbve/src/content/docs/project/agones-palworld.mdx` (version bump — publish lever)

**Interfaces:**
- Consumes: generator + validator scripts (Tasks 1–2), generated artifact (Task 3).

- [ ] **Step 1: Add the nx target**

In `apps/kbve/astro-kbve/project.json`, add to `targets` (mirror `gen:ci-manifest` shape):

```json
"gen:palworld-shops": {
  "executor": "nx:run-commands",
  "inputs": [
    "{projectRoot}/src/content/docs/palworld/palshop/*.mdx",
    "{projectRoot}/scripts/generate-palworld-shops.mjs",
    "{projectRoot}/scripts/validate-palworld-shops.mjs"
  ],
  "outputs": [
    "{workspaceRoot}/apps/agones/palworld/mods/PalSchema/mods/KBVEShops/raw/kbve-shops.json"
  ],
  "options": {
    "cwd": "apps/kbve/astro-kbve",
    "parallel": false,
    "commands": [
      "node scripts/validate-palworld-shops.mjs",
      "node scripts/generate-palworld-shops.mjs"
    ]
  },
  "cache": true
}
```

- [ ] **Step 2: Run the target end-to-end**

Run: `cd /Users/alappatel/Documents/GitHub/kbve/.claude/worktrees/palforge-signv2 && ./kbve.sh -nx run astro-kbve:gen:palworld-shops --skip-nx-cache`
Expected: validator passes, generator writes the JSON, exit 0. (If `./kbve.sh` is unavailable in the worktree, the equivalent is running the two `node` commands from Task 3 Steps 2–3; note which was used in the report.)

- [ ] **Step 3: Confirm overlay.sh already stages KBVEShops (no edit expected)**

Read `apps/agones/palworld/overlay.sh` and confirm the PalSchema block copies `${SCHEMA_OVERLAY}/.` (i.e. `mods/PalSchema/mods/*`) into `Mods/PalSchema/mods/`. `KBVEShops/raw/kbve-shops.json` sits under that tree, so it is staged automatically. If — and only if — the copy is narrower than the whole `mods/` subtree, add `KBVEShops` to the staged set. Record the finding in the report.

- [ ] **Step 4: Attribution note**

Append to `apps/agones/palworld/mods/PalSchema/README.md`:

```markdown
## Shops (KBVEShops)

Shop tables (`DT_ItemShopCreateData`) are generated from MDX frontmatter under
`apps/kbve/astro-kbve/src/content/docs/palworld/palshop/*.mdx` by
`scripts/generate-palworld-shops.mjs` (nx target `astro-kbve:gen:palworld-shops`).
Edit the MDX, regenerate, commit both. Item ids and layout take structural
reference from the Hex Reworked Shop (Nexus) PalSchema mod; all prices, stock,
and curation are KBVE-authored.
```

- [ ] **Step 5: Version bump (publish lever)**

In `apps/kbve/astro-kbve/src/content/docs/project/agones-palworld.mdx`, bump the `version:` frontmatter to the next patch (the CI manifest sync propagates it to `version.toml` + `gameserver.yaml`; do not hand-edit those). Read the current value first and increment the patch.

- [ ] **Step 6: Commit**

```bash
git add apps/kbve/astro-kbve/project.json apps/agones/palworld/mods/PalSchema/README.md apps/kbve/astro-kbve/src/content/docs/project/agones-palworld.mdx
git commit -m "chore(palworld-shops): nx gen target, attribution, version bump"
```

---

## Post-implementation (manual, outside this plan)

- Open PR; on merge the image rebuilds.
- Recreate the GameServer to load the new image (`kubectl delete gameserver palworld -n palworld`); confirm restarts settle and the save is intact.
- Verify the PalSchema apply log lists the KBVEShops mod, and the in-game Village shop shows the curated stock (other shops vanilla).
- Phase 2: add the remaining shop MDX files; the generator already handles them.
```
