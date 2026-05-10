#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const source = path.resolve(repoRoot, 'dist/apps/astro-kbve/api/npcdb.json');
const target = path.resolve(
	here,
	'..',
	'standalone/solitaire/npcdb-snapshot.json',
);

const raw = await readFile(source, 'utf8').catch((err) => {
	console.error(
		`[snapshot-solitaire-npcdb] cannot read ${source} — run astro-kbve:build first.\n${err.message}`,
	);
	process.exit(1);
});

JSON.parse(raw);
await writeFile(target, raw, 'utf8');
console.log(`[snapshot-solitaire-npcdb] wrote ${target} (${raw.length} bytes)`);
