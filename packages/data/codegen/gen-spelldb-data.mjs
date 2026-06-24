#!/usr/bin/env node
/**
 * Generate proto-canonical spell data artifacts from the MDX source of truth.
 *
 * Mirrors gen-npcdb-data.mjs (minus the Unity/C# sync — spelldb consumers are
 * the arpg web HUD and the Rust sim).
 *
 * Inputs:
 *   apps/kbve/astro-kbve/src/content/docs/spelldb/*.mdx (authoritative catalog)
 *   packages/data/codegen/descriptors/spelldb.binpb     (proto schema descriptor)
 *
 * Outputs:
 *   packages/data/codegen/generated/spelldb-data.json   (proto-canonical camelCase)
 *   packages/data/codegen/generated/spelldb-data.binpb  (wire-format proto binary)
 *
 * Usage:
 *   node packages/data/codegen/gen-spelldb-data.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import {
	toBinary,
	fromJson,
	fromBinary,
	createFileRegistry,
} from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const spelldbDir = resolve(
	repoRoot,
	'apps/kbve/astro-kbve/src/content/docs/spelldb',
);
const descriptorPath = resolve(__dirname, 'descriptors/spelldb.binpb');
const generatedDir = resolve(__dirname, 'generated');
const outputJsonPath = resolve(generatedDir, 'spelldb-data.json');
const outputBinPath = resolve(generatedDir, 'spelldb-data.binpb');

const ENUM_PREFIX = {
	school: 'SPELL_SCHOOL_',
	target: 'SPELL_TARGET_',
	effect: 'SPELL_EFFECT_',
	rarity: 'SPELL_RARITY_',
};

const ASTRO_ONLY_FIELDS = new Set(['title']);

function snakeToCamel(key) {
	return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function transform(node, parentFieldCamel) {
	if (node === null || node === undefined) return node;
	if (Array.isArray(node))
		return node.map((c) => transform(c, parentFieldCamel));
	if (typeof node === 'object') {
		const out = {};
		for (const [rawKey, rawValue] of Object.entries(node)) {
			const camelKey = snakeToCamel(rawKey);
			if (ASTRO_ONLY_FIELDS.has(camelKey)) continue;
			out[camelKey] = transform(rawValue, camelKey);
		}
		return out;
	}
	if (
		parentFieldCamel &&
		ENUM_PREFIX[parentFieldCamel] &&
		typeof node === 'string'
	) {
		return `${ENUM_PREFIX[parentFieldCamel]}${node.toUpperCase()}`;
	}
	return node;
}

function loadSpellsFromMdx() {
	const files = readdirSync(spelldbDir).filter(
		(f) => f.endsWith('.mdx') && f !== 'index.mdx',
	);
	const spells = [];
	for (const file of files) {
		const full = resolve(spelldbDir, file);
		const { data } = matter(readFileSync(full, 'utf8'));
		if (!data.id || !data.ref || !data.name) continue;
		if (data.drafted === true) continue;
		spells.push(transform(data));
	}
	return spells;
}

function main() {
	const spells = loadSpellsFromMdx();
	console.log(`Loaded ${spells.length} spell defs from MDX`);

	const registryJson = { spells };
	writeFileSync(outputJsonPath, JSON.stringify(registryJson, null, 2));
	console.log(`Wrote ${outputJsonPath}`);

	const descBytes = readFileSync(descriptorPath);
	const fds = fromBinary(FileDescriptorSetSchema, descBytes);
	const registry = createFileRegistry(fds);
	const spellRegistryDesc = registry.getMessage('spell.SpellRegistry');
	if (!spellRegistryDesc) {
		console.error(
			'FATAL: spell.SpellRegistry message descriptor not found in spelldb.binpb',
		);
		process.exit(1);
	}

	const msg = fromJson(spellRegistryDesc, registryJson, {
		ignoreUnknownFields: true,
	});
	const wire = toBinary(spellRegistryDesc, msg);
	writeFileSync(outputBinPath, wire);
	console.log(`Wrote ${outputBinPath} (${wire.length} bytes)`);
}

main();
