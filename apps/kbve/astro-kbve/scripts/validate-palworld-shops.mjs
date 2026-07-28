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
