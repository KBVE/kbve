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
