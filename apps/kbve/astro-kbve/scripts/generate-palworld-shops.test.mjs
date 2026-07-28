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
