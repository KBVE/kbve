#!/usr/bin/env node
/**
 * Generate proto-canonical profession data artifacts from the MDX source of truth.
 *
 * Mirrors gen-spelldb-data.mjs. professiondb is definition-only: the MDX holds
 * the static shape of each discipline (xp curve, actions, unlocks). Per-unit
 * progression is runtime state owned by each game, not this catalog.
 *
 * Inputs:
 *   apps/kbve/astro-kbve/src/content/docs/professiondb/*.mdx (authoritative catalog)
 *   packages/data/codegen/descriptors/professiondb.binpb     (proto schema descriptor)
 *
 * Outputs:
 *   packages/data/codegen/generated/professiondb-data.json   (proto-canonical camelCase)
 *   packages/data/codegen/generated/professiondb-data.binpb  (wire-format proto binary)
 *
 * Usage:
 *   node packages/data/codegen/gen-professiondb-data.mjs
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
const professiondbDir = resolve(
	repoRoot,
	'apps/kbve/astro-kbve/src/content/docs/professiondb',
);
const descriptorPath = resolve(__dirname, 'descriptors/professiondb.binpb');
const generatedDir = resolve(__dirname, 'generated');
const outputJsonPath = resolve(generatedDir, 'professiondb-data.json');
const outputBinPath = resolve(generatedDir, 'professiondb-data.binpb');

const ENUM_PREFIX = {
	category: 'PROFESSION_CATEGORY_',
	kind: 'CURVE_KIND_',
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

function loadProfessionsFromMdx() {
	const files = readdirSync(professiondbDir).filter(
		(f) => f.endsWith('.mdx') && f !== 'index.mdx',
	);
	const professions = [];
	for (const file of files) {
		const full = resolve(professiondbDir, file);
		const { data } = matter(readFileSync(full, 'utf8'));
		if (!data.id || !data.ref || !data.name) continue;
		if (data.drafted === true) continue;
		professions.push(transform(data));
	}
	return professions;
}

function main() {
	const professions = loadProfessionsFromMdx();
	console.log(`Loaded ${professions.length} profession defs from MDX`);

	const registryJson = { professions };
	writeFileSync(outputJsonPath, JSON.stringify(registryJson, null, 2));
	console.log(`Wrote ${outputJsonPath}`);

	const descBytes = readFileSync(descriptorPath);
	const fds = fromBinary(FileDescriptorSetSchema, descBytes);
	const registry = createFileRegistry(fds);
	const registryDesc = registry.getMessage('profession.ProfessionRegistry');
	if (!registryDesc) {
		console.error(
			'FATAL: profession.ProfessionRegistry message descriptor not found in professiondb.binpb',
		);
		process.exit(1);
	}

	const msg = fromJson(registryDesc, registryJson, {
		ignoreUnknownFields: true,
	});
	const wire = toBinary(registryDesc, msg);
	writeFileSync(outputBinPath, wire);
	console.log(`Wrote ${outputBinPath} (${wire.length} bytes)`);
}

main();
