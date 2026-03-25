#!/usr/bin/env node
/**
 * Generate nx-proto.json — machine-readable registry of all proto schemas
 * and their codegen status.
 *
 * Usage:
 *   npx tsx packages/data/codegen/generate-proto-registry.mjs
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const protoRoot = resolve(__dirname, '../proto');
const codegenDir = resolve(__dirname);
const generatedDir = resolve(__dirname, 'generated');
const descriptorsDir = resolve(__dirname, 'descriptors');

// Read gen-all.mjs registry entries
const genAllPath = resolve(__dirname, 'gen-all.mjs');
const genAllContent = readFileSync(genAllPath, 'utf8');
const registryEntries = [];
const entryRegex = /name:\s*'(\w+)',\s*\n\s*protoFile:\s*'([^']+)',\s*\n\s*package:\s*'([^']+)'/g;
let match;
while ((match = entryRegex.exec(genAllContent)) !== null) {
	registryEntries.push({
		name: match[1],
		protoFile: match[2],
		package: match[3],
	});
}

// Find all .proto files (excluding google well-known types)
function findProtos(dir, prefix = '') {
	const results = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			if (entry.name === 'google') continue; // skip well-known types
			results.push(...findProtos(resolve(dir, entry.name), relPath));
		} else if (entry.name.endsWith('.proto')) {
			results.push(relPath);
		}
	}
	return results;
}

const allProtos = findProtos(protoRoot);

// Build registry
const protos = allProtos.map((protoFile) => {
	const fullPath = resolve(protoRoot, protoFile);
	const content = readFileSync(fullPath, 'utf8');

	// Count messages and enums
	const messages = (content.match(/^message\s+\w+/gm) || []).map((m) =>
		m.replace('message ', ''),
	);
	const enums = (content.match(/^enum\s+\w+/gm) || []).map((e) =>
		e.replace('enum ', ''),
	);

	// Check codegen status
	const entry = registryEntries.find((e) => e.protoFile === protoFile);
	const hasCodegen = !!entry;
	const codegenName = entry?.name || null;

	const zodConfig = codegenName
		? resolve(codegenDir, `${codegenName}-zod-config.json`)
		: null;
	const zodOutput = codegenName
		? resolve(generatedDir, `${codegenName}-schema.ts`)
		: null;
	const binpb = codegenName
		? resolve(descriptorsDir, `${codegenName}.binpb`)
		: null;

	return {
		proto: `packages/data/proto/${protoFile}`,
		package: entry?.package || content.match(/^package\s+([^;]+)/m)?.[1] || 'unknown',
		messages,
		enums,
		message_count: messages.length,
		enum_count: enums.length,
		codegen: {
			registered: hasCodegen,
			name: codegenName,
			zod_config: zodConfig && existsSync(zodConfig)
				? relative(repoRoot, zodConfig)
				: null,
			zod_output: zodOutput && existsSync(zodOutput)
				? relative(repoRoot, zodOutput)
				: null,
			binpb: binpb && existsSync(binpb)
				? relative(repoRoot, binpb)
				: null,
		},
	};
});

const registered = protos.filter((p) => p.codegen.registered);
const orphaned = protos.filter(
	(p) => !p.codegen.registered && p.message_count > 0,
);
const utilityOnly = protos.filter(
	(p) => !p.codegen.registered && p.message_count === 0,
);

const registry = {
	generated_at: new Date().toISOString(),
	summary: {
		total_protos: protos.length,
		registered: registered.length,
		orphaned: orphaned.length,
		utility_only: utilityOnly.length,
		total_messages: protos.reduce((s, p) => s + p.message_count, 0),
		total_enums: protos.reduce((s, p) => s + p.enum_count, 0),
	},
	protos,
	orphaned_protos: orphaned.map((p) => p.proto),
};

process.stdout.write(JSON.stringify(registry, null, 2) + '\n');
