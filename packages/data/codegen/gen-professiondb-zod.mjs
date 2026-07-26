#!/usr/bin/env node
/**
 * Generate Zod schemas from professiondb.proto using @kbve/devops codegen.
 *
 * Usage:
 *   npx tsx packages/data/codegen/gen-professiondb-zod.mjs
 */

import { generateAndWriteZod } from '../../npm/devops/src/lib/codegen/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await generateAndWriteZod({
	descriptorPath: resolve(__dirname, 'descriptors/professiondb.binpb'),
	configPath: resolve(__dirname, 'professiondb-zod-config.json'),
	outputPath: resolve(__dirname, 'generated/professiondb-schema.ts'),
	protoPackage: 'profession',
});

console.log('✓ Generated professiondb-schema.ts');
