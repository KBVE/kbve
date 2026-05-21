import { mkdir, readdir, readFile, writeFile, stat } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { resolveBaseRef } from './mc-texture-aliases.mjs';

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

async function tryRefAcrossKinds(ref) {
	const item = await fetchOne('item', ref);
	if (item.status !== 'missing') return item;
	const block = await fetchOne('block', ref);
	return block;
}

async function main() {
	const refs = await collectItemRefs();
	console.log(`Discovered ${refs.size} refs from MDX frontmatter`);

	let fetched = 0;
	let skipped = 0;
	let aliased = 0;
	let missing = 0;
	for (const ref of refs) {
		const direct = await tryRefAcrossKinds(ref);
		if (direct.status === 'fetched') {
			fetched++;
			continue;
		}
		if (direct.status === 'skip') {
			skipped++;
			continue;
		}
		// direct is 'missing' — chase the derived → base mapping. Some
		// refs need >1 hop (waxed_exposed_cut_copper_slab → strip waxed →
		// exposed_cut_copper_slab → strip slab → exposed_cut_copper).
		const chain = [];
		const seen = new Set([ref]);
		let cursor = ref;
		while (true) {
			const next = resolveBaseRef(cursor);
			if (!next || next === cursor || seen.has(next)) break;
			chain.push(next);
			seen.add(next);
			cursor = next;
			if (chain.length >= 4) break;
		}
		if (chain.length === 0) {
			console.warn(`  ⚠ no texture for ${ref} (item/ + block/ both 404, no alias)`);
			missing++;
			continue;
		}
		let resolved = null;
		for (const alias of chain) {
			const res = await tryRefAcrossKinds(alias);
			if (res.status === 'fetched' || res.status === 'skip') {
				resolved = { alias, res };
				break;
			}
		}
		if (resolved) {
			if (resolved.res.status === 'fetched') {
				fetched++;
				console.log(`  ↳ ${ref} → ${resolved.alias} (${resolved.res.kind}/)`);
			} else {
				skipped++;
			}
			aliased++;
		} else {
			console.warn(`  ⚠ no texture for ${ref} → ${chain.join(' → ')} (chain 404)`);
			missing++;
		}
	}
	console.log(
		`✨ fetched: ${fetched}  skipped: ${skipped}  aliased: ${aliased}  missing: ${missing}`,
	);
}

main().catch((err) => {
	console.error('❌', err.message);
	process.exit(1);
});
