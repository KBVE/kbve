#!/usr/bin/env node
/**
 * Copies the generated professiondb data into the Rust crates that embed it via
 * include_str!(). The generated JSON is produced from the professiondb MDX
 * collection by `node packages/data/codegen/gen-professiondb-data.mjs`.
 *
 * Usage: node scripts/sync-professiondb.mjs
 *
 * Outputs:
 *   src-tauri/src/data/professiondb.json   (isometric client)
 *   ../axum-kbve/src/data/professiondb.json (gameserver)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(
	__dirname,
	'../../../../packages/data/codegen/generated/professiondb-data.json',
);
const OUTPUT_TARGETS = [
	resolve(__dirname, '../src-tauri/src/data/professiondb.json'),
	resolve(__dirname, '../../axum-kbve/src/data/professiondb.json'),
];

/**
 * Format through the workspace prettier so a re-sync produces a byte-identical
 * file and never shows up as a lint diff. Falls back to tab-indented JSON when
 * prettier is unavailable (e.g. a bare CI checkout).
 */
async function format(value, filepath) {
	const fallback = `${JSON.stringify(value, null, '\t')}\n`;
	try {
		const prettier = await import('prettier');
		const options = await prettier.resolveConfig(filepath);
		return await prettier.format(fallback, {
			...options,
			filepath,
			parser: 'json',
		});
	} catch {
		return fallback;
	}
}

async function main() {
	const raw = readFileSync(SOURCE, 'utf-8');
	const parsed = JSON.parse(raw);
	const professions = parsed.professions ?? [];
	if (professions.length === 0) {
		throw new Error(`[sync-professiondb] no professions in ${SOURCE}`);
	}

	for (const target of OUTPUT_TARGETS) {
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, await format(parsed, target));
		console.log(
			`[sync-professiondb] wrote ${professions.length} professions to ${target}`,
		);
	}
}

await main();
