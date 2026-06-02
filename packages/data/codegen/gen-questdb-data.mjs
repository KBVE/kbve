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

function loadQuestsFromMdx() {
	const files = readdirSync(questdbDir).filter(
		(f) => f.endsWith('.mdx') && f !== 'index.mdx',
	);
	const quests = [];
	for (const file of files) {
		const full = resolve(questdbDir, file);
		const { data } = matter(readFileSync(full, 'utf8'));
		if (!data.id || !data.ref || !data.title) continue;
		if (data.drafted === true) continue;
		quests.push(transform(data));
	}
	return quests;
}

function main() {
	const quests = loadQuestsFromMdx();
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
		writeFileSync(resolve(t.dir, 'questdb.json'), JSON.stringify(registryJson));
		writeFileSync(resolve(t.dir, 'questdb.binpb'), wire);
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
	if (process.env.KBVE_PROTOC_REGEN === '1') {
		for (const t of csharpTargets) {
			if (!existsSync(t.dir)) mkdirSync(t.dir, { recursive: true });
			try {
				execSync(
					`protoc --csharp_out="${t.dir}" --proto_path="${protoRoot}" ${protoFiles.join(' ')}`,
					{ stdio: 'pipe' },
				);
				console.log(`Regenerated C# protos for ${t.name} → ${t.dir}`);
			} catch (err) {
				console.warn(
					`[warn] protoc csharp gen for ${t.name} failed — ${err.stderr?.toString().trim() || err.message}`,
				);
				console.warn(
					'       Skipping C# regeneration; install protoc (brew install protobuf) if you need it locally.',
				);
			}
		}
	} else {
		console.log(
			'[skip] C# proto regen — set KBVE_PROTOC_REGEN=1 to opt in (committed Generated/Proto/*.cs is canonical otherwise).',
		);
	}
}

main();
