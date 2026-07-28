#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const generatedDir = resolve(__dirname, 'generated');
const itemdbPath = resolve(generatedDir, 'itemdb-data.json');
const professiondbPath = resolve(generatedDir, 'professiondb-data.json');
const outPath = resolve(generatedDir, 'xref-index.json');

const CONTENT_VERSION = 'phase1';

function main() {
	const items = JSON.parse(readFileSync(itemdbPath, 'utf8')).items ?? [];
	const professions =
		JSON.parse(readFileSync(professiondbPath, 'utf8')).professions ?? [];

	const itemKeyByRef = new Map();
	for (const it of items) itemKeyByRef.set(it.ref, it.key);

	const producedBy = {};
	const inputTo = {};
	const toolFor = {};
	const warnings = [];

	const add = (map, itemRef, actionKey, relation) => {
		const itemKey = itemKeyByRef.get(itemRef);
		if (itemKey === undefined) {
			warnings.push(`${relation}: item '${itemRef}' not in itemdb`);
			return;
		}
		(map[itemKey] ??= []).push(actionKey);
	};

	for (const prof of professions) {
		for (const action of prof.actions ?? []) {
			for (const o of action.outputs ?? [])
				add(producedBy, o.itemRef, action.key, 'produced_by');
			for (const i of action.inputs ?? [])
				add(inputTo, i.itemRef, action.key, 'input_to');
			for (const t of action.toolRefs ?? [])
				add(toolFor, t, action.key, 'tool_for');
		}
	}

	const index = {
		content_version: CONTENT_VERSION,
		slug_to_key: Object.fromEntries(itemKeyByRef),
		produced_by: producedBy,
		input_to: inputTo,
		tool_for: toolFor,
	};
	writeFileSync(outPath, JSON.stringify(index, null, 2));
	console.log(`Wrote ${outPath}`);
	console.log(
		`produced_by=${Object.keys(producedBy).length} input_to=${Object.keys(inputTo).length} tool_for=${Object.keys(toolFor).length}`,
	);
	if (warnings.length) {
		console.warn(`\n[xref warn-only] ${warnings.length} unresolved refs:`);
		for (const w of warnings) console.warn(`  ⚠ ${w}`);
	}
	console.log('\n[xref] warn-only mode — build not failed.');
}

main();
