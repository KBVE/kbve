#!/usr/bin/env node
/**
 * Generate proto-canonical quest data artifacts from the MDX source of truth.
 *
 * Mirrors gen-mapdb-data.mjs / gen-itemdb-data.mjs.
 *
 * Inputs:
 *   apps/kbve/astro-kbve/src/content/docs/questdb/*.mdx (authoritative catalog)
 *   packages/data/codegen/descriptors/questdb.binpb     (proto schema descriptor)
 *
 * Outputs:
 *   packages/data/codegen/generated/questdb-data.json   (proto-canonical camelCase JSON)
 *   packages/data/codegen/generated/questdb-data.binpb  (wire-format proto binary)
 *   apps/rareicon/unity-rareicon/Assets/StreamingAssets/questdb.json   (mirror)
 *   apps/rareicon/unity-rareicon/Assets/StreamingAssets/questdb.binpb  (mirror)
 *   apps/friendslop/godot-friendslop/assets/questdb/questdb.json       (mirror)
 *   apps/friendslop/godot-friendslop/assets/questdb/questdb.binpb      (mirror)
 *
 * Also regenerates apps/rareicon/.../Generated/Proto/Questdb.cs (+ Common.cs)
 * via protoc so the Unity QuestSeedSystem stays aligned with the proto shape.
 *
 * Usage:
 *   node packages/data/codegen/gen-questdb-data.mjs
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
	takeI18n,
	collectLocales,
	encodeLocaleTables,
} from './lib/i18n-slice.mjs';
import {
	fromBinary,
	toBinary,
	fromJson,
	createFileRegistry,
} from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const questdbDir = resolve(
	repoRoot,
	'apps/kbve/astro-kbve/src/content/docs/questdb',
);
const descriptorPath = resolve(__dirname, 'descriptors/questdb.binpb');
const generatedDir = resolve(__dirname, 'generated');
const outputJsonPath = resolve(generatedDir, 'questdb-data.json');
const outputBinPath = resolve(generatedDir, 'questdb-data.binpb');

const ENUM_PREFIX = {
	category: 'QUEST_CATEGORY_',
	type: 'OBJECTIVE_',
	status: 'QUEST_STATUS_',
	consequence: 'CONSEQUENCE_',
	failurePolicy: 'FAILURE_',
	rewardPolicy: 'REWARD_',
};

/// Frontmatter keys that belong to the page rather than to the quest. `title` is not one
/// of them, however much it looks like Starlight's: `quest.Quest` and `quest.QuestStep`
/// both carry a title of their own, and it is the only human-readable name a quest has.
/// Dropping it left every quest in the registry — and every step of every quest — with
/// nothing to call itself but its ref.
const ASTRO_ONLY_FIELDS = new Set([]);

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

function loadQuestsFromMdx(locales) {
	// readdir order is filesystem-dependent; sort so the artifacts come out
	// byte-identical on a contributor's macOS and in Linux CI.
	const files = readdirSync(questdbDir)
		.filter((f) => f.endsWith('.mdx') && f !== 'index.mdx')
		.sort();
	const quests = [];
	for (const file of files) {
		const full = resolve(questdbDir, file);
		const { data } = matter(readFileSync(full, 'utf8'));
		// Lift translations before the entry is read, so they never reach the registry.
		const i18n = takeI18n(data);
		if (!data.id || !data.ref || !data.title) continue;
		if (data.drafted === true) continue;
		locales.add(String(data.ref), i18n);
		quests.push(transform(data));
	}
	return quests;
}

function main() {
	const locales = collectLocales();
	const quests = loadQuestsFromMdx(locales);
	console.log(`Loaded ${quests.length} quest defs from MDX`);

	const registryJson = { quests };
	writeFileSync(outputJsonPath, JSON.stringify(registryJson, null, 2));
	console.log(`Wrote ${outputJsonPath}`);

	const descBytes = readFileSync(descriptorPath);
	const fds = fromBinary(FileDescriptorSetSchema, descBytes);
	const registry = createFileRegistry(fds);
	const questRegistryDesc = registry.getMessage('quest.QuestRegistry');
	if (!questRegistryDesc) {
		console.error(
			'FATAL: quest.QuestRegistry message descriptor not found in questdb.binpb',
		);
		process.exit(1);
	}

	const msg = fromJson(questRegistryDesc, registryJson, {
		ignoreUnknownFields: true,
	});
	const wire = toBinary(questRegistryDesc, msg);
	writeFileSync(outputBinPath, wire);
	console.log(`Wrote ${outputBinPath} (${wire.length} bytes)`);

	const localeArtifacts = encodeLocaleTables(locales, 'questdb');

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
			dir: resolve(repoRoot, 'apps/friendslop/godot-friendslop/assets/questdb'),
		},
	];
	for (const t of syncTargets) {
		if (!existsSync(t.dir)) mkdirSync(t.dir, { recursive: true });
		writeFileSync(resolve(t.dir, 'questdb.json'), JSON.stringify(registryJson));
		writeFileSync(resolve(t.dir, 'questdb.binpb'), wire);
		for (const { table, encoded } of localeArtifacts) {
			writeFileSync(
				resolve(t.dir, `questdb.${table.locale}.json`),
				JSON.stringify(table),
			);
			writeFileSync(resolve(t.dir, `questdb.${table.locale}.binpb`), encoded);
		}
		console.log(`Synced ${t.name} → ${t.dir}`);
	}

	const protoRoot = resolve(repoRoot, 'packages/data/proto');
	const protoFiles = ['kbve/common.proto', 'quest/questdb.proto'];
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
