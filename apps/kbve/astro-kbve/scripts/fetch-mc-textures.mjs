/**
 * Fetch Minecraft vanilla item + block textures from
 * InventivetalentDev/minecraft-assets and write them under
 * apps/kbve/astro-kbve/public/mc/textures/{item,block}/.
 *
 * Reads refs from each MDX page under src/content/docs/mc/items/<slug>.mdx
 * (frontmatter `mc_item.ref` + every `recipes[*].ingredients[*].ref`) and
 * src/content/docs/mc/blocks/<slug>.mdx (`mc_block.ref` + drops). Skips refs
 * we already have on disk. Pinned to MC_ASSET_VERSION below.
 *
 * Run: node scripts/fetch-mc-textures.mjs
 */

import { mkdir, readdir, readFile, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

const MC_ASSET_VERSION = '1.21.5';
const BASE = `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/${MC_ASSET_VERSION}/assets/minecraft/textures`;
const PUBLIC_DIR = './public/mc/textures';
const ITEMS_DIR = './src/content/docs/mc/items';
const BLOCKS_DIR = './src/content/docs/mc/blocks';

async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function readFrontmatter(file) {
	const txt = await readFile(file, 'utf-8');
	const m = txt.match(/^---\n([\s\S]*?)\n---/);
	if (!m) return null;
	try {
		return parseYaml(m[1]);
	} catch {
		return null;
	}
}

async function collectItemRefs() {
	const refs = new Set();
	for (const dir of [ITEMS_DIR, BLOCKS_DIR]) {
		if (!(await exists(dir))) continue;
		const files = await readdir(dir);
		for (const f of files.filter((n) => n.endsWith('.mdx'))) {
			const fm = await readFrontmatter(join(dir, f));
			if (!fm) continue;
			const item = fm.mc_item ?? fm.mc_block;
			if (!item?.ref) continue;
			refs.add(item.ref);
			for (const r of item.recipes ?? []) {
				for (const ing of r.ingredients ?? []) {
					if (ing.ref) refs.add(ing.ref);
				}
			}
			for (const d of item.drops ?? []) {
				if (d.ref) refs.add(d.ref);
			}
		}
	}
	return refs;
}

async function fetchOne(kind, ref) {
	const dest = join(PUBLIC_DIR, kind, `${ref}.png`);
	if (await exists(dest)) return { ref, kind, status: 'skip' };
	const res = await fetch(`${BASE}/${kind}/${ref}.png`);
	if (!res.ok) return { ref, kind, status: res.status === 404 ? 'missing' : 'error' };
	const buf = Buffer.from(await res.arrayBuffer());
	await mkdir(join(PUBLIC_DIR, kind), { recursive: true });
	await writeFile(dest, buf);
	return { ref, kind, status: 'fetched' };
}

async function main() {
	const refs = await collectItemRefs();
	console.log(`Discovered ${refs.size} refs from MDX frontmatter`);

	let fetched = 0;
	let skipped = 0;
	let missing = 0;
	for (const ref of refs) {
		const item = await fetchOne('item', ref);
		if (item.status === 'fetched') fetched++;
		else if (item.status === 'skip') skipped++;
		if (item.status === 'missing') {
			const block = await fetchOne('block', ref);
			if (block.status === 'fetched') fetched++;
			else if (block.status === 'skip') skipped++;
			else if (block.status === 'missing') {
				console.warn(`  ⚠ no texture for ${ref} (item/ + block/ both 404)`);
				missing++;
			}
		}
	}
	console.log(`✨ fetched: ${fetched}  skipped: ${skipped}  missing: ${missing}`);
}

main().catch((err) => {
	console.error('❌', err.message);
	process.exit(1);
});
