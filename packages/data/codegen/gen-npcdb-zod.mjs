#!/usr/bin/env node
/**
 * Generate Zod schemas from npcdb.proto using @kbve/devops codegen.
 *
 * Usage:
 *   npx tsx packages/data/codegen/gen-npcdb-zod.mjs
 */

import { generateAndWriteZod } from '../../npm/devops/src/lib/codegen/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await generateAndWriteZod({
	descriptorPath: resolve(__dirname, 'descriptors/npcdb.binpb'),
	configPath: resolve(__dirname, 'npcdb-zod-config.json'),
	outputPath: resolve(__dirname, 'generated/npcdb-schema.ts'),
	protoPackage: 'npc',
});

console.log('✓ Generated npcdb-schema.ts');
