#!/usr/bin/env node
/**
 * Generate Zod schemas from clickhouse.proto using @kbve/devops codegen.
 *
 * Usage:
 *   npx tsx packages/data/codegen/gen-clickhouse-zod.mjs
 */

import { generateAndWriteZod } from '../../npm/devops/src/lib/codegen/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await generateAndWriteZod({
	descriptorPath: resolve(__dirname, 'descriptors/clickhouse.binpb'),
	configPath: resolve(__dirname, 'clickhouse-zod-config.json'),
	outputPath: resolve(__dirname, 'generated/clickhouse-schema.ts'),
	protoPackage: 'clickhouse',
});

console.log('✓ Generated clickhouse-schema.ts');
