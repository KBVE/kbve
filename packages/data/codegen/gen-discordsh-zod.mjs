#!/usr/bin/env node
/**
 * Generate Zod schemas from discordsh.proto using @kbve/devops codegen.
 *
 * Usage:
 *   npx tsx packages/data/codegen/gen-discordsh-zod.mjs
 */

import { generateAndWriteZod } from '../../npm/devops/src/lib/codegen/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await generateAndWriteZod({
	descriptorPath: resolve(__dirname, 'descriptors/discordsh.binpb'),
	configPath: resolve(__dirname, 'discordsh-zod-config.json'),
	outputPath: resolve(__dirname, 'generated/discordsh-schema.ts'),
	protoPackage: 'kbve.discordsh',
});

console.log('✓ Generated discordsh-schema.ts');
