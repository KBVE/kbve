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
