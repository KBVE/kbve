#!/usr/bin/env node
/**
 * Full proto-to-zod pipeline — single command to regenerate everything.
 *
 * 1. Compiles all .proto files to .binpb descriptors via protoc
 * 2. Generates Zod schemas from each descriptor + config
 *
 * Usage:
 *   npx tsx packages/data/codegen/gen-all.mjs            # all protos
 *   npx tsx packages/data/codegen/gen-all.mjs clickhouse  # single proto by name
 */

import { generateAndWriteZod } from '../../npm/devops/src/lib/codegen/index.js';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const protoRoot = resolve(__dirname, '../proto');
const descriptorsDir = resolve(__dirname, 'descriptors');
const generatedDir = resolve(__dirname, 'generated');

// Registry: each entry maps a proto to its codegen config and output.
// Optional `outputPath` overrides the default `generated/<name>-schema.ts`.
const protos = [
	{
		name: 'npcdb',
		protoFile: 'npc/npcdb.proto',
		package: 'npc',
	},
	{
		name: 'itemdb',
		protoFile: 'item/itemdb.proto',
		package: 'item',
	},
	{
		name: 'questdb',
		protoFile: 'quest/questdb.proto',
		package: 'quest',
	},
	{
		name: 'mapdb',
		protoFile: 'map/mapdb.proto',
		package: 'map',
	},
	{
		name: 'clickhouse',
		protoFile: 'jedi/clickhouse.proto',
		package: 'clickhouse',
	},
	{
		name: 'osrs',
		protoFile: 'kbve/osrs.proto',
		package: 'kbve.osrs',
	},
	{
		name: 'discordsh',
		protoFile: 'kbve/discordsh.proto',
		package: 'kbve.discordsh',
	},
	{
		name: 'ci_registry',
		protoFile: 'kbve/ci_registry.proto',
		package: 'kbve.ci',
	},
];

// Optional filter: pass a proto name as CLI arg to regenerate only that one
const filterName = process.argv[2];
const selected = filterName
	? protos.filter((p) => p.name === filterName)
	: protos;

if (filterName && selected.length === 0) {
	console.error(`Unknown proto: "${filterName}". Available: ${protos.map((p) => p.name).join(', ')}`);
	process.exit(1);
}

console.log('=== Proto-to-Zod Pipeline ===\n');

// Step 1: Compile selected protos to .binpb
console.log('Step 1: Compiling protos to descriptors...');
for (const proto of selected) {
	const binpb = resolve(descriptorsDir, `${proto.name}.binpb`);
	const cmd = `protoc --include_imports --descriptor_set_out="${binpb}" --proto_path="${protoRoot}" ${proto.protoFile}`;
	try {
		execSync(cmd, { stdio: 'pipe' });
		console.log(`  ✓ ${proto.protoFile} → ${proto.name}.binpb`);
	} catch (err) {
		console.error(`  ✗ ${proto.protoFile} failed:`);
		console.error(err.stderr?.toString() || err.message);
		process.exit(1);
	}
}

// Step 2: Generate Zod schemas from each descriptor
console.log('\nStep 2: Generating Zod schemas...');
for (const proto of selected) {
	const configPath = resolve(__dirname, `${proto.name}-zod-config.json`);
	const descriptorPath = resolve(descriptorsDir, `${proto.name}.binpb`);
	const outputPath = proto.outputPath
		? resolve(__dirname, proto.outputPath)
		: resolve(generatedDir, `${proto.name}-schema.ts`);

	await generateAndWriteZod({
		descriptorPath,
		configPath,
		outputPath,
		protoPackage: proto.package,
	});
	console.log(`  ✓ ${proto.name}-schema.ts`);
}

console.log('\n=== Done ===');
