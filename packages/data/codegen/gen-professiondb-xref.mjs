#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const generatedDir = resolve(__dirname, 'generated');
const itemdbPath = resolve(generatedDir, 'itemdb-data.json');
const professiondbPath = resolve(generatedDir, 'professiondb-data.json');
const mapdbPath = resolve(generatedDir, 'mapdb-data.json');
const outPath = resolve(generatedDir, 'xref-index.json');

const CONTENT_VERSION = 'phase1';

export function main() {
	const items = JSON.parse(readFileSync(itemdbPath, 'utf8')).items ?? [];
	const professions =
		JSON.parse(readFileSync(professiondbPath, 'utf8')).professions ?? [];
	const objectDefs =
		JSON.parse(readFileSync(mapdbPath, 'utf8')).objectDefs ?? [];

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

	const actionByRef = new Map();
	for (const prof of professions) {
		for (const action of prof.actions ?? []) {
			for (const o of action.outputs ?? [])
				add(producedBy, o.itemRef, action.key, 'produced_by');
			for (const i of action.inputs ?? [])
				add(inputTo, i.itemRef, action.key, 'input_to');
			for (const t of action.toolRefs ?? [])
				add(toolFor, t, action.key, 'tool_for');
			actionByRef.set(action.ref, action.key);
		}
	}

	const objectDefByRef = new Map();
	for (const o of objectDefs) objectDefByRef.set(o.ref, o);

	const nodeLinks = {};
	const nodeByRef = {};
	for (const prof of professions) {
		for (const action of prof.actions ?? []) {
			if (!action.resourceNodeRef) continue;
			if (!objectDefByRef.has(action.resourceNodeRef)) {
				warnings.push(
					`node_links: action '${action.ref}' resourceNodeRef '${action.resourceNodeRef}' not in mapdb`,
				);
				continue;
			}
			nodeLinks[action.key] = action.resourceNodeRef;
			nodeByRef[action.resourceNodeRef] = action.key;
		}
	}

	for (const o of objectDefs) {
		if (!o.professionActionRef) continue;
		if (!actionByRef.has(o.professionActionRef)) {
			warnings.push(
				`node_links: objectDef '${o.ref}' professionActionRef '${o.professionActionRef}' not in professiondb`,
			);
			continue;
		}
		const actionKey = actionByRef.get(o.professionActionRef);
		const linkedNodeRef = nodeLinks[actionKey];
		if (linkedNodeRef !== undefined && linkedNodeRef !== o.ref) {
			warnings.push(
				`node_links: mismatched pair — action '${o.professionActionRef}' links node '${linkedNodeRef}' but node '${o.ref}' links action '${o.professionActionRef}'`,
			);
		}
	}

	const index = {
		content_version: CONTENT_VERSION,
		slug_to_key: Object.fromEntries(itemKeyByRef),
		produced_by: producedBy,
		input_to: inputTo,
		tool_for: toolFor,
		node_links: nodeLinks,
		node_by_ref: nodeByRef,
	};
	writeFileSync(outPath, JSON.stringify(index, null, 2));
	console.log(`Wrote ${outPath}`);
	console.log(
		`produced_by=${Object.keys(producedBy).length} input_to=${Object.keys(inputTo).length} tool_for=${Object.keys(toolFor).length} node_links=${Object.keys(nodeLinks).length}`,
	);
	if (warnings.length) {
		console.warn(`\n[xref warn-only] ${warnings.length} unresolved refs:`);
		for (const w of warnings) console.warn(`  ⚠ ${w}`);
	}
	console.log('\n[xref] warn-only mode — build not failed.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
