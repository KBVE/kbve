#!/usr/bin/env node
/**
 * Generate proto-canonical spell data artifacts from the MDX source of truth.
 *
 * Mirrors gen-npcdb-data.mjs (minus the Unity/C# sync — spelldb consumers are
 * the arpg web HUD and the Rust sim).
 *
 * Inputs:
 *   apps/kbve/astro-kbve/src/content/docs/spelldb/*.mdx (authoritative catalog)
 *   packages/proto/kbve/spell/v1/spell.proto            (proto schema)
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
	takeI18n,
	collectLocales,
	encodeLocaleTables,
} from './lib/i18n-slice.mjs';
import { encodeRegistry } from './proto-encode.mjs';
import { kbveProtoDescriptor } from './lib/proto-descriptor.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const spelldbDir = resolve(
	repoRoot,
	'apps/kbve/astro-kbve/src/content/docs/spelldb',
);
const generatedDir = resolve(__dirname, 'generated');
const outputJsonPath = resolve(generatedDir, 'spelldb-data.json');
const outputBinPath = resolve(generatedDir, 'spelldb-data.binpb');

const ENUM_PREFIX = {
	school: 'ELEMENT_',
	target: 'SPELL_TARGET_',
	effect: 'SPELL_EFFECT_',
	rarity: 'RARITY_',
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

function loadSpellsFromMdx(locales) {
	// readdir order is filesystem-dependent; sort so the artifacts come out
	// byte-identical on a contributor's macOS and in Linux CI.
	const files = readdirSync(spelldbDir)
		.filter((f) => f.endsWith('.mdx') && f !== 'index.mdx')
		.sort();
	const spells = [];
	for (const file of files) {
		const full = resolve(spelldbDir, file);
		const { data } = matter(readFileSync(full, 'utf8'));
		// Lift translations before the entry is read, so they never reach the registry.
		const i18n = takeI18n(data);
		if (!data.id || !data.ref || !data.name) continue;
		if (data.drafted === true) continue;
		locales.add(String(data.ref), i18n);
		spells.push(transform(data));
	}
	return spells;
}

function main() {
	const locales = collectLocales();
	const spells = loadSpellsFromMdx(locales);
	console.log(`Loaded ${spells.length} spell defs from MDX`);

	const registryJson = { spells };
	writeFileSync(outputJsonPath, JSON.stringify(registryJson, null, 2));
	console.log(`Wrote ${outputJsonPath}`);

	const wire = encodeRegistry(
		kbveProtoDescriptor(),
		'kbve.spell.v1.SpellRegistry',
		registryJson,
	);
	writeFileSync(outputBinPath, wire);
	console.log(`Wrote ${outputBinPath} (${wire.length} bytes)`);

	// spelldb has no per-game mirrors; the tables sit beside the registry.
	for (const { table, encoded } of encodeLocaleTables(locales, 'spelldb')) {
		writeFileSync(
			resolve(generatedDir, `spelldb.${table.locale}.json`),
			JSON.stringify(table),
		);
		writeFileSync(resolve(generatedDir, `spelldb.${table.locale}.binpb`), encoded);
	}
}

main();
