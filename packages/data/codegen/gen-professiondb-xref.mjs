#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
	fromJson,
	toBinary,
	fromBinary,
	createFileRegistry,
} from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';

const __dirname = dirname(fileURLToPath(import.meta.url));
const generatedDir = resolve(__dirname, 'generated');
const descriptorPath = resolve(__dirname, 'descriptors/professiondb.binpb');
const itemdbPath = resolve(generatedDir, 'itemdb-data.json');
const professiondbPath = resolve(generatedDir, 'professiondb-data.json');
const mapdbPath = resolve(generatedDir, 'mapdb-data.json');
const outPath = resolve(generatedDir, 'xref-index.json');
const outBinPath = resolve(generatedDir, 'xref-index.binpb');

function canonicalize(value) {
	if (Array.isArray(value)) {
		const mapped = value.map(canonicalize);
		if (
			mapped.every((v) => typeof v === 'string' || typeof v === 'number')
		) {
			return [...mapped].sort((a, b) =>
				String(a).localeCompare(String(b)),
			);
		}
		return mapped;
	}
	if (value && typeof value === 'object') {
		const out = {};
		for (const k of Object.keys(value).sort())
			out[k] = canonicalize(value[k]);
		return out;
	}
	return value;
}

function contentVersion(payload) {
	const canonical = JSON.stringify(canonicalize(payload));
	const digest = createHash('sha256').update(canonical).digest('hex');
	return `sha256-${digest.slice(0, 16)}`;
}

export function main() {
	const itemsRaw = JSON.parse(readFileSync(itemdbPath, 'utf8'));
	const items = itemsRaw.items ?? [];
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
	const errors = [];

	const OWNERSHIP_FIELDS = [
		'harvestYield',
		'harvestTimeMs',
		'resourceNodeRef',
		'professionActionRef',
		'gatherAction',
		'gatherActions',
		'compressAction',
		'compressActions',
		'skillingAction',
		'skillingActions',
		'durationMs',
	];
	const OWNERSHIP_TOP_KEYS = [
		'professions',
		'actions',
		'gatherActions',
		'compressActions',
		'skillingActions',
	];
	for (const k of OWNERSHIP_TOP_KEYS) {
		if (Object.prototype.hasOwnProperty.call(itemsRaw, k)) {
			errors.push(
				`single_source: itemdb-data.json owns top-level '${k}' — must live in professiondb`,
			);
		}
	}
	for (const it of items) {
		for (const f of OWNERSHIP_FIELDS) {
			if (Object.prototype.hasOwnProperty.call(it, f)) {
				errors.push(
					`single_source: itemdb item '${it.ref}' carries profession field '${f}' — must live in professiondb`,
				);
			}
		}
	}

	const add = (map, itemRef, actionKey, relation) => {
		const itemKey = itemKeyByRef.get(itemRef);
		if (itemKey === undefined) {
			errors.push(`${relation}: item '${itemRef}' not in itemdb`);
			return;
		}
		(map[itemKey] ??= []).push(actionKey);
	};

	const actionByRef = new Map();
	const allActions = [];
	for (const prof of professions) {
		for (const action of prof.actions ?? []) {
			for (const o of action.outputs ?? [])
				add(producedBy, o.itemRef, action.key, 'produced_by');
			for (const i of action.inputs ?? [])
				add(inputTo, i.itemRef, action.key, 'input_to');
			for (const t of action.toolRefs ?? [])
				add(toolFor, t, action.key, 'tool_for');
			actionByRef.set(action.ref, action.key);
			allActions.push(action);
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
				errors.push(
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
			errors.push(
				`node_links: objectDef '${o.ref}' professionActionRef '${o.professionActionRef}' not in professiondb`,
			);
			continue;
		}
		const actionKey = actionByRef.get(o.professionActionRef);
		const linkedNodeRef = nodeLinks[actionKey];
		if (linkedNodeRef !== undefined && linkedNodeRef !== o.ref) {
			errors.push(
				`node_links: mismatched pair — action '${o.professionActionRef}' links node '${linkedNodeRef}' but node '${o.ref}' links action '${o.professionActionRef}'`,
			);
		}
	}

	for (const prof of professions) {
		for (const action of prof.actions ?? []) {
			if (!action.resourceNodeRef) continue;
			const node = objectDefByRef.get(action.resourceNodeRef);
			if (node && node.professionActionRef !== action.ref) {
				errors.push(
					`graph_integrity: action '${action.ref}' targets node '${action.resourceNodeRef}' but node back-refs '${node.professionActionRef ?? '(none)'}'`,
				);
			}
		}
	}
	for (const prof of professions) {
		for (const action of prof.actions ?? []) {
			const hasOutput = (action.outputs ?? []).length > 0;
			const hasNode = Boolean(action.resourceNodeRef);
			if (!hasOutput && !hasNode) {
				warnings.push(
					`orphan_action: action '${action.ref}' has neither outputs nor a resource node`,
				);
			}
		}
	}

	const producersOf = new Map();
	for (const action of allActions) {
		for (const o of action.outputs ?? []) {
			if (!producersOf.has(o.itemRef)) producersOf.set(o.itemRef, []);
			producersOf.get(o.itemRef).push(action.ref);
		}
	}
	const gatherOutputs = new Set();
	for (const action of allActions) {
		if (!action.resourceNodeRef) continue;
		for (const o of action.outputs ?? []) gatherOutputs.add(o.itemRef);
	}
	const reachableItems = new Set(gatherOutputs);
	for (const ref of itemKeyByRef.keys()) {
		if (!producersOf.has(ref)) reachableItems.add(ref);
	}
	let grew = true;
	while (grew) {
		grew = false;
		for (const action of allActions) {
			const inputs = (action.inputs ?? []).map((i) => i.itemRef);
			if (inputs.every((x) => reachableItems.has(x))) {
				for (const o of action.outputs ?? []) {
					if (!reachableItems.has(o.itemRef)) {
						reachableItems.add(o.itemRef);
						grew = true;
					}
				}
			}
		}
	}
	for (const action of allActions) {
		const blocked = (action.inputs ?? [])
			.map((i) => i.itemRef)
			.filter((x) => !reachableItems.has(x));
		if (blocked.length) {
			errors.push(
				`graph_integrity: action '${action.ref}' is unreachable — input(s) [${blocked.join(', ')}] are produced by no gatherable or reachable action`,
			);
		}
	}

	const actionDeps = new Map();
	for (const action of allActions) {
		const deps = new Set();
		for (const i of action.inputs ?? []) {
			for (const pr of producersOf.get(i.itemRef) ?? []) {
				if (pr !== action.ref) deps.add(pr);
			}
		}
		actionDeps.set(action.ref, deps);
	}
	const WHITE = 0;
	const GRAY = 1;
	const BLACK = 2;
	const color = new Map();
	const seenCycles = new Set();
	const visit = (ref, stack) => {
		color.set(ref, GRAY);
		for (const dep of actionDeps.get(ref) ?? []) {
			const state = color.get(dep) ?? WHITE;
			if (state === GRAY) {
				const at = stack.indexOf(dep);
				const loop = [...stack.slice(at >= 0 ? at : 0), ref, dep];
				const canonical = [...loop].sort().join('|');
				if (!seenCycles.has(canonical)) {
					seenCycles.add(canonical);
					errors.push(
						`graph_integrity: recipe cycle detected — ${loop.join(' -> ')}`,
					);
				}
			} else if (state === WHITE) {
				visit(dep, [...stack, ref]);
			}
		}
		color.set(ref, BLACK);
	};
	for (const action of allActions) {
		if ((color.get(action.ref) ?? WHITE) === WHITE) visit(action.ref, []);
	}

	const payload = {
		slug_to_key: Object.fromEntries(itemKeyByRef),
		produced_by: producedBy,
		input_to: inputTo,
		tool_for: toolFor,
		node_links: nodeLinks,
		node_by_ref: nodeByRef,
	};
	const index = { content_version: contentVersion(payload), ...payload };
	console.log(
		`produced_by=${Object.keys(producedBy).length} input_to=${Object.keys(inputTo).length} tool_for=${Object.keys(toolFor).length} node_links=${Object.keys(nodeLinks).length}`,
	);
	if (warnings.length) {
		console.warn(`\n[xref warn] ${warnings.length} soft issue(s):`);
		for (const w of warnings) console.warn(`  ⚠ ${w}`);
	}
	if (errors.length) {
		console.error(`\n[xref FAIL] ${errors.length} error-class violation(s):`);
		for (const e of errors) console.error(`  ✗ ${e}`);
		throw new Error(
			`professiondb xref validation failed with ${errors.length} error(s)`,
		);
	}
	writeFileSync(outPath, JSON.stringify(index, null, 2));
	console.log(`Wrote ${outPath}`);

	const descBytes = readFileSync(descriptorPath);
	const registry = createFileRegistry(
		fromBinary(FileDescriptorSetSchema, descBytes),
	);
	const xrefDesc = registry.getMessage('profession.XrefIndex');
	if (!xrefDesc) {
		throw new Error(
			'FATAL: profession.XrefIndex message descriptor not found in professiondb.binpb',
		);
	}
	const wrapKeyLists = (map) =>
		Object.fromEntries(
			Object.entries(map).map(([k, v]) => [k, { keys: v }]),
		);
	const protoJson = {
		content_version: index.content_version,
		slug_to_key: index.slug_to_key,
		produced_by: wrapKeyLists(index.produced_by),
		input_to: wrapKeyLists(index.input_to),
		tool_for: wrapKeyLists(index.tool_for),
		node_links: index.node_links,
		node_by_ref: index.node_by_ref,
	};
	const wire = toBinary(
		xrefDesc,
		fromJson(xrefDesc, protoJson, { ignoreUnknownFields: false }),
	);
	writeFileSync(outBinPath, wire);
	console.log(`Wrote ${outBinPath} (${wire.length} bytes)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
