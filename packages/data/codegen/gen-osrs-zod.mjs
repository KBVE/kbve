#!/usr/bin/env node
/**
 * Generate Zod schemas from osrs.proto using @kbve/devops codegen.
 *
 * Usage:
 *   npx tsx packages/data/codegen/gen-osrs-zod.mjs
 */

import { generateAndWriteZod } from '../../npm/devops/src/lib/codegen/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await generateAndWriteZod({
	descriptorPath: resolve(__dirname, 'descriptors/osrs.binpb'),
	configPath: resolve(__dirname, 'osrs-zod-config.json'),
	outputPath: resolve(__dirname, 'generated/osrs-schema.ts'),
	protoPackage: 'kbve.osrs',
});

console.log('✓ Generated osrs-schema.ts');
