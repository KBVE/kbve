#!/usr/bin/env node
/**
 * Generate Zod schemas from spelldb.proto using @kbve/devops codegen.
 *
 * Usage:
 *   npx tsx packages/data/codegen/gen-spelldb-zod.mjs
 */

import { generateAndWriteZod } from '../../npm/devops/src/lib/codegen/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await generateAndWriteZod({
	descriptorPath: resolve(__dirname, 'descriptors/spelldb.binpb'),
	configPath: resolve(__dirname, 'spelldb-zod-config.json'),
	outputPath: resolve(__dirname, 'generated/spelldb-schema.ts'),
	protoPackage: 'spell',
});

console.log('✓ Generated spelldb-schema.ts');
