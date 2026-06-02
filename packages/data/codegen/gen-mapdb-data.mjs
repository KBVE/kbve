#!/usr/bin/env node
/**
 * Generate proto-canonical map data artifacts from the MDX source of truth.
 *
 * Mirrors gen-itemdb-data.mjs — shared mapdb pipeline, not game-specific.
 *
 * Inputs:
 *   apps/kbve/astro-kbve/src/content/docs/mapdb/*.mdx   (authoritative catalog)
 *   packages/data/codegen/descriptors/mapdb.binpb       (proto schema descriptor)
 *
 * Outputs:
 *   packages/data/codegen/generated/mapdb-data.json    (proto-canonical camelCase JSON)
 *   packages/data/codegen/generated/mapdb-data.binpb   (wire-format proto binary)
 *   apps/rareicon/unity-rareicon/Assets/StreamingAssets/mapdb.json   (same JSON, mirrored)
 *   apps/rareicon/unity-rareicon/Assets/StreamingAssets/mapdb.binpb  (same binary, mirrored)
 *
 * Usage:
 *   node packages/data/codegen/gen-mapdb-data.mjs
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const mapdbDir = resolve(
	repoRoot,
	'apps/kbve/astro-kbve/src/content/docs/mapdb',
);
const descriptorPath = resolve(__dirname, 'descriptors/mapdb.binpb');
const generatedDir = resolve(__dirname, 'generated');
const outputJsonPath = resolve(generatedDir, 'mapdb-data.json');
const outputBinPath = resolve(generatedDir, 'mapdb-data.binpb');

// Enum field → proto enum value prefix. Keyed by the camelCase field name
// as it appears in the canonical output.
const ENUM_PREFIX = {
	type: 'WORLD_OBJECT_',
	resourceType: 'RESOURCE_',
	containerType: 'CONTAINER_',
	craftingStationType: 'CRAFTING_STATION_',
	footprintShape: 'FOOTPRINT_SHAPE_',
	costSource: 'COST_SOURCE_',
	kind: 'SERVICE_KIND_',
};

// Astro-only rendering fields that don't exist in the proto — strip them
// so fromJson() doesn't reject them even with ignoreUnknownFields (they
// bloat the output unnecessarily).
const ASTRO_ONLY_FIELDS = new Set([
	'pixelsPerUnit',
	'pivot',
	'pivotX',
	'pivotY',
	'meshType',
	'extrudeEdges',
	'sortingLayer',
	'sortingIndex',
	'staticSorting',
	'wrapMode',
	'animation',
	'title', // duplicates `name`
]);

function snakeToCamel(key) {
	return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// Path-scoped escape hatches — fields whose NAME collides across multiple
// proto messages, where only some instances are enums. Known cases:
// `BuildCost.resource_type` is a free-form string, but `WorldObjectDef.resource_type`
// is a `ResourceType` enum — skip the prefix transform when resourceType
// appears inside a buildCosts entry.
const ENUM_SKIP_UNDER_GRANDPARENT = {
	resourceType: new Set(['buildCosts']),
};

function transform(node, parentFieldCamel, grandparentFieldCamel) {
	if (node === null || node === undefined) return node;
	if (Array.isArray(node)) {
		return node.map((c) => transform(c, parentFieldCamel, grandparentFieldCamel));
	}
	if (typeof node === 'object') {
		const out = {};
		for (const [rawKey, rawValue] of Object.entries(node)) {
			const camelKey = snakeToCamel(rawKey);
			if (ASTRO_ONLY_FIELDS.has(camelKey)) continue;
			out[camelKey] = transform(rawValue, camelKey, parentFieldCamel);
		}
		return out;
	}
	if (
		parentFieldCamel &&
		ENUM_PREFIX[parentFieldCamel] &&
		typeof node === 'string'
	) {
		const skip = ENUM_SKIP_UNDER_GRANDPARENT[parentFieldCamel];
		if (skip && grandparentFieldCamel && skip.has(grandparentFieldCamel)) {
			return node;
		}
		return `${ENUM_PREFIX[parentFieldCamel]}${node.toUpperCase()}`;
	}
	return node;
}

function loadObjectDefsFromMdx() {
	const files = readdirSync(mapdbDir).filter(
		(f) => f.endsWith('.mdx') && f !== 'index.mdx',
	);
	const objectDefs = [];
	for (const file of files) {
		const full = resolve(mapdbDir, file);
		const { data } = matter(readFileSync(full, 'utf8'));
		if (!data.id || !data.ref || !data.name || !data.type) continue;
		if (data.drafted === true) continue;
		objectDefs.push(transform(data));
	}
	return objectDefs;
}

function main() {
	const objectDefs = loadObjectDefsFromMdx();
	console.log(`Loaded ${objectDefs.length} world object defs from MDX`);

	// 1. JSON artifact — canonical MapRegistry shape
	const registryJson = { objectDefs };
	writeFileSync(outputJsonPath, JSON.stringify(registryJson, null, 2));
	console.log(`Wrote ${outputJsonPath}`);

	// 2. Encode to proto binary via the descriptor + bufbuild reflection
	const descBytes = readFileSync(descriptorPath);
	const fds = fromBinary(FileDescriptorSetSchema, descBytes);
	const registry = createFileRegistry(fds);
	const mapRegistryDesc = registry.getMessage('map.MapRegistry');
	if (!mapRegistryDesc) {
		console.error(
			'FATAL: map.MapRegistry message descriptor not found in mapdb.binpb',
		);
		process.exit(1);
	}

	const msg = fromJson(mapRegistryDesc, registryJson, {
		ignoreUnknownFields: true,
	});
	const wire = toBinary(mapRegistryDesc, msg);
	writeFileSync(outputBinPath, wire);
	console.log(`Wrote ${outputBinPath} (${wire.length} bytes)`);

	// Per-game sync targets — each Unity game mirrors the two artifacts into
	// its StreamingAssets so the runtime loader finds them at boot. Add a new
	// entry here when a second game starts consuming the mapdb.
	const syncTargets = [
		{
			name: 'rareicon',
			dir: resolve(
				repoRoot,
				'apps/rareicon/unity-rareicon/Assets/StreamingAssets',
			),
		},
	];
	for (const t of syncTargets) {
		if (!existsSync(t.dir)) mkdirSync(t.dir, { recursive: true });
		writeFileSync(resolve(t.dir, 'mapdb.json'), JSON.stringify(registryJson));
		writeFileSync(resolve(t.dir, 'mapdb.binpb'), wire);
		console.log(`Synced ${t.name} → ${t.dir}`);
	}

	// JSON-only sync targets — non-Unity consumers (e.g. discordsh-bot embeds
	// the JSON via include_str! at compile time and uses bevy_mapdb::MapDb::from_json).
	const jsonOnlyTargets = [
		{
			name: 'discordsh-bot',
			path: resolve(
				repoRoot,
				'apps/discordsh/discordsh-bot/data/mapdb.json',
			),
		},
	];
	for (const t of jsonOnlyTargets) {
		mkdirSync(dirname(t.path), { recursive: true });
		writeFileSync(t.path, JSON.stringify(registryJson));
		console.log(`Synced ${t.name} → ${t.path}`);
	}

	// 3. Regenerate C# proto classes so Unity's MapdbLoaderSystem stays in
	// sync with the proto shape. Produces Mapdb.cs + its common.proto
	// dependency under the per-game Generated/Proto/ folder. The runtime
	// Google.Protobuf DLL ships via nuget inside Assets/Packages.
	const protoRoot = resolve(repoRoot, 'packages/data/proto');
	const protoFiles = ['kbve/common.proto', 'map/mapdb.proto'];
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
