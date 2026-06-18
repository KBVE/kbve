#!/usr/bin/env node
/**
 * Generate Zod schemas from argocd.proto using @kbve/devops codegen.
 *
 * Usage:
 *   npx tsx packages/data/codegen/gen-argocd-zod.mjs
 */

import { generateAndWriteZod } from '../../npm/devops/src/lib/codegen/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await generateAndWriteZod({
	descriptorPath: resolve(__dirname, 'descriptors/argocd.binpb'),
	configPath: resolve(__dirname, 'argocd-zod-config.json'),
	outputPath: resolve(__dirname, 'generated/argocd-schema.ts'),
	protoPackage: 'argocd',
});

console.log('✓ Generated argocd-schema.ts');
