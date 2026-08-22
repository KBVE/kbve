#!/usr/bin/env node
/**
 * Generate proto-canonical NPC data artifacts from the MDX source of truth.
 *
 * Mirrors gen-mapdb-data.mjs / gen-questdb-data.mjs.
 *
 * Inputs:
 *   apps/kbve/astro-kbve/src/content/docs/npcdb/*.mdx (authoritative catalog)
 *   packages/data/codegen/descriptors/npcdb.binpb     (proto schema descriptor)
 *
 * Outputs:
 *   packages/data/codegen/generated/npcdb-data.json   (proto-canonical camelCase JSON)
 *   packages/data/codegen/generated/npcdb-data.binpb  (wire-format proto binary)
 *   apps/rareicon/unity-rareicon/Assets/StreamingAssets/npcdb.json   (mirror)
 *   apps/rareicon/unity-rareicon/Assets/StreamingAssets/npcdb.binpb  (mirror)
 *
 * Also regenerates apps/rareicon/.../Generated/Proto/Npcdb.cs (+ Common.cs).
 *
 * Usage:
 *   node packages/data/codegen/gen-npcdb-data.mjs
 */

import {
	readFileSync,
	writeFileSync,
	readdirSync,
	mkdirSync,
	existsSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import {
	fromBinary,
	toBinary,
	fromJson,
	createFileRegistry,
} from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';
import {
	takeI18n,
	collectLocales,
	encodeLocaleTables,
	assertLocaleParity,
} from './lib/i18n-slice.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const npcdbDir = resolve(
	repoRoot,
	'apps/kbve/astro-kbve/src/content/docs/npcdb',
);
const descriptorPath = resolve(__dirname, 'descriptors/npcdb.binpb');
const generatedDir = resolve(__dirname, 'generated');
const outputJsonPath = resolve(generatedDir, 'npcdb-data.json');
const outputBinPath = resolve(generatedDir, 'npcdb-data.binpb');

const DB = 'npcdb';

const ENUM_PREFIX = {
	personality:      'PERSONALITY_',
	element:          'ELEMENT_',
	secondaryElement: 'ELEMENT_',
	rarity:           'NPC_RARITY_',
	rank:             'NPC_RANK_',
	family:           'CREATURE_FAMILY_',
	movementType:     'MOVEMENT_TYPE_',
	renderKind:       'CREATURE_RENDER_KIND_',
	schedule:         'CREATURE_SCHEDULE_',
	difficulty:       'DIFFICULTY_',
	slot:             'EQUIP_SLOT_',
	anim:             'SPRITE_ANIM_',
	growthRate:       'GROWTH_RATE_',
	category:         'MOVE_CATEGORY_',
	target:           'MOVE_TARGET_',
	stat:             'STAT_KIND_',
};

const ASTRO_ONLY_FIELDS = new Set([
	'title',
]);

function snakeToCamel(key) {
	return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function transform(node, parentFieldCamel) {
	if (node === null || node === undefined) return node;
	if (Array.isArray(node)) return node.map((c) => transform(c, parentFieldCamel));
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

function loadNpcsFromMdx(locales) {
	// readdir order is filesystem-dependent; sort so the artifacts come out
	// byte-identical on a contributor's macOS and in Linux CI.
	const files = readdirSync(npcdbDir)
		.filter((f) => f.endsWith('.mdx') && f !== 'index.mdx')
		.sort();
	const npcs = [];
	for (const file of files) {
		const full = resolve(npcdbDir, file);
		const { data } = matter(readFileSync(full, 'utf8'));
		// Lift translations before anything else reads the entry, so they can never
		// reach the canonical registry.
		const i18n = takeI18n(data);
		if (!data.id || !data.ref || !data.name) continue;
		if (data.drafted === true) continue;
		locales.add(String(data.ref), i18n);
		npcs.push(transform(data));
	}
	return npcs;
}

function main() {
	const locales = collectLocales();
	const npcs = loadNpcsFromMdx(locales);
	console.log(`Loaded ${npcs.length} npc defs from MDX`);
	assertLocaleParity(locales, DB);

	const registryJson = { npcs };
	writeFileSync(outputJsonPath, JSON.stringify(registryJson, null, 2));
	console.log(`Wrote ${outputJsonPath}`);

	const descBytes = readFileSync(descriptorPath);
	const fds = fromBinary(FileDescriptorSetSchema, descBytes);
	const registry = createFileRegistry(fds);
	const npcRegistryDesc = registry.getMessage('npc.NpcRegistry');
	if (!npcRegistryDesc) {
		console.error(
			'FATAL: npc.NpcRegistry message descriptor not found in npcdb.binpb',
		);
		process.exit(1);
	}

	const msg = fromJson(npcRegistryDesc, registryJson, {
		ignoreUnknownFields: true,
	});
	const wire = toBinary(npcRegistryDesc, msg);
	writeFileSync(outputBinPath, wire);
	console.log(`Wrote ${outputBinPath} (${wire.length} bytes)`);

	// Locale tables ride alongside the registry: same mirrors, one file per language,
	// so a runtime loads only the language it is showing.
	const localeArtifacts = encodeLocaleTables(locales, DB);

	const syncTargets = [
		{
			name: 'rareicon',
			dir: resolve(
				repoRoot,
				'apps/rareicon/unity-rareicon/Assets/StreamingAssets',
			),
		},
		{
			name: 'friendslop',
			dir: resolve(repoRoot, 'apps/friendslop/godot-friendslop/assets/npcdb'),
		},
	];
	for (const t of syncTargets) {
		if (!existsSync(t.dir)) mkdirSync(t.dir, { recursive: true });
		writeFileSync(resolve(t.dir, 'npcdb.json'), JSON.stringify(registryJson));
		writeFileSync(resolve(t.dir, 'npcdb.binpb'), wire);
		for (const { table, encoded } of localeArtifacts) {
			writeFileSync(
				resolve(t.dir, `npcdb.${table.locale}.json`),
				JSON.stringify(table),
			);
			writeFileSync(resolve(t.dir, `npcdb.${table.locale}.binpb`), encoded);
		}
		console.log(`Synced ${t.name} → ${t.dir}`);
	}

	const protoRoot = resolve(repoRoot, 'packages/data/proto');
	const protoFiles = ['kbve/common.proto', 'npc/npcdb.proto'];
	const csharpTargets = [
		{
			name: 'rareicon',
			dir: resolve(
				repoRoot,
				'apps/rareicon/unity-rareicon/Assets/_RareIcon/Generated/Proto',
			),
		},
	];
	const protoc = resolve(repoRoot, 'node_modules/grpc-tools/bin/protoc');
	for (const t of csharpTargets) {
		if (!existsSync(t.dir)) mkdirSync(t.dir, { recursive: true });
		try {
			execSync(
				`"${protoc}" --csharp_out="${t.dir}" --proto_path="${protoRoot}" ${protoFiles.join(' ')}`,
				{ stdio: 'pipe' },
			);
			console.log(`Regenerated C# protos for ${t.name} → ${t.dir}`);
		} catch (err) {
			console.warn(
				`[warn] protoc csharp gen for ${t.name} failed — ${err.stderr?.toString().trim() || err.message}`,
			);
			console.warn(
				'       Skipping C# regeneration; run `pnpm install` to fetch grpc-tools.',
			);
		}
	}
}

main();
