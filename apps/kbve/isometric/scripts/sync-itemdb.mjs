#!/usr/bin/env node
/**
 * Extracts item definitions from the Astro itemdb MDX frontmatter and writes
 * a static JSON file that the Rust build embeds via include_str!().
 *
 * Usage: node scripts/sync-itemdb.mjs
 *
 * Output: src-tauri/src/data/itemdb.json
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ITEMDB_DIR = resolve(
	__dirname,
	'../../astro-kbve/src/content/docs/itemdb',
);
const OUTPUT_DIR = resolve(__dirname, '../src-tauri/src/data');
const OUTPUT_FILE = join(OUTPUT_DIR, 'itemdb.json');

function extractFrontmatter(content) {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return null;
	try {
		return parseYaml(match[1]);
	} catch {
		return null;
	}
}

function main() {
	const files = readdirSync(ITEMDB_DIR).filter((f) => f.endsWith('.mdx'));

	const items = [];
	const index = {};

	for (const file of files) {
		const content = readFileSync(join(ITEMDB_DIR, file), 'utf-8');
		const data = extractFrontmatter(content);
		if (!data || !data.id || !data.name || data.key === undefined || !data.ref)
			continue;
		if (file === 'index.mdx' || data.key === 0) continue;

		const idx = items.length;
		items.push(data);

		index[data.id] = idx;
		index[data.name] = idx;
		index[String(data.key)] = idx;
		index[data.ref] = idx;
	}

	mkdirSync(OUTPUT_DIR, { recursive: true });
	writeFileSync(OUTPUT_FILE, JSON.stringify({ items, index }, null, 2));

	console.log(
		`[sync-itemdb] wrote ${items.length} items to ${OUTPUT_FILE}`,
	);
}

main();
