#!/usr/bin/env node
/**
 * Full proto-to-zod pipeline — single command to regenerate everything.
 *
 * 1. Compiles all .proto files to .binpb descriptors via protoc
 * 2. Generates Zod schemas from each descriptor + config
 *
 * Usage:
 *   npx tsx packages/data/codegen/gen-all.mjs
 */

import { generateAndWriteZod } from '../../npm/devops/src/lib/codegen/index.js';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const protoRoot = resolve(__dirname, '../proto');
const descriptorsDir = resolve(__dirname, 'descriptors');
const generatedDir = resolve(__dirname, 'generated');

// Registry: each entry maps a proto to its codegen config and output
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
];

console.log('=== Proto-to-Zod Pipeline ===\n');

// Step 1: Compile all protos to .binpb
console.log('Step 1: Compiling protos to descriptors...');
for (const proto of protos) {
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
for (const proto of protos) {
	const configPath = resolve(__dirname, `${proto.name}-zod-config.json`);
	const descriptorPath = resolve(descriptorsDir, `${proto.name}.binpb`);
	const outputPath = resolve(generatedDir, `${proto.name}-schema.ts`);

	await generateAndWriteZod({
		descriptorPath,
		configPath,
		outputPath,
		protoPackage: proto.package,
	});
	console.log(`  ✓ ${proto.name}-schema.ts`);
}

console.log('\n=== Done ===');
