#!/usr/bin/env node
/**
 * Generate Zod schemas from mapdb.proto using @kbve/devops codegen.
 *
 * Usage:
 *   npx tsx packages/data/codegen/gen-mapdb-zod.mjs
 */

import { generateAndWriteZod } from '../../npm/devops/src/lib/codegen/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await generateAndWriteZod({
	descriptorPath: resolve(__dirname, 'descriptors/mapdb.binpb'),
	configPath: resolve(__dirname, 'mapdb-zod-config.json'),
	outputPath: resolve(__dirname, 'generated/mapdb-schema.ts'),
	protoPackage: 'map',
});

console.log('✓ Generated mapdb-schema.ts');
