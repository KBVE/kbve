#!/usr/bin/env node
/**
 * Generate Zod schemas from itemdb.proto using @kbve/devops codegen.
 *
 * Usage:
 *   npx tsx packages/data/codegen/gen-itemdb-zod.mjs
 */

import { generateAndWriteZod } from '../../npm/devops/src/lib/codegen/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await generateAndWriteZod({
	descriptorPath: resolve(__dirname, 'descriptors/itemdb.binpb'),
	configPath: resolve(__dirname, 'itemdb-zod-config.json'),
	outputPath: resolve(__dirname, 'generated/itemdb-schema.ts'),
	protoPackage: 'item',
});

console.log('✓ Generated itemdb-schema.ts');
