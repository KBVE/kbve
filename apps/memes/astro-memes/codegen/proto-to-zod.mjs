/**
 * proto-to-zod.mjs — Generates Zod schemas from meme.proto
 *
 * Usage: node apps/memes/astro-memes/codegen/proto-to-zod.mjs
 *
 * Reads packages/data/proto/meme/meme.proto and outputs
 * apps/memes/astro-memes/src/schemas/generated/meme.zod.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// ── Config ──────────────────────────────────────────────────────────────────

const PROTO_PATH = resolve('packages/data/proto/meme/meme.proto');
const OUTPUT_PATH = resolve(
	'apps/memes/astro-memes/src/schemas/generated/meme.zod.ts',
);

// ── Parse ───────────────────────────────────────────────────────────────────

function parseProto(source) {
	const enums = [];
	const messages = [];

	const lines = source.split('\n');
	let i = 0;

	while (i < lines.length) {
		const line = lines[i].trim();

		if (
			!line ||
			line.startsWith('//') ||
			line.startsWith('syntax') ||
			line.startsWith('package') ||
			line.startsWith('import')
		) {
			i++;
			continue;
		}

		// Service block — skip entirely
		if (line.startsWith('service ')) {
			let depth = 0;
			for (; i < lines.length; i++) {
				const l = lines[i];
				depth += (l.match(/{/g) || []).length;
				depth -= (l.match(/}/g) || []).length;
				if (depth <= 0 && l.includes('}')) {
					i++;
					break;
				}
			}
			continue;
		}

		// Enum block
		const enumMatch = line.match(/^enum\s+(\w+)\s*\{/);
		if (enumMatch) {
			const name = enumMatch[1];
			const values = [];
			i++;
			while (i < lines.length) {
				const eLine = lines[i].trim();
				if (eLine === '}') {
					i++;
					break;
				}
				const valueMatch = eLine.match(/^(\w+)\s*=\s*\d+\s*;/);
				if (valueMatch) {
					values.push(valueMatch[1]);
				}
				i++;
			}
			enums.push({ name, values });
			continue;
		}

		// Message block
		const msgMatch = line.match(/^message\s+(\w+)\s*\{/);
		if (msgMatch) {
			const name = msgMatch[1];
			const fields = [];
			i++;
			while (i < lines.length) {
				const mLine = lines[i].trim();
				if (mLine === '}') {
					i++;
					break;
				}

				if (!mLine || mLine.startsWith('//')) {
					i++;
					continue;
				}

				const fieldMatch = mLine.match(
					/^(optional\s+|repeated\s+)?(\S+)\s+(\w+)\s*=\s*\d+\s*;/,
				);
				if (fieldMatch) {
					const modifier = (fieldMatch[1] || '').trim();
					fields.push({
						name: fieldMatch[3],
						type: fieldMatch[2],
						repeated: modifier === 'repeated',
						optional: modifier === 'optional',
					});
				}
				i++;
			}
			messages.push({ name, fields });
			continue;
		}

		i++;
	}

	return { enums, messages };
}

// ── Topological Sort ────────────────────────────────────────────────────────

function topoSort(messages, enumNames) {
	const msgIndex = new Map();
	messages.forEach((m, idx) => msgIndex.set(m.name, idx));

	const deps = new Map();
	for (const m of messages) {
		const s = new Set();
		for (const f of m.fields) {
			if (msgIndex.has(f.type) && f.type !== m.name) {
				s.add(f.type);
			}
		}
		deps.set(m.name, s);
	}

	const inDeg = new Map();
	for (const m of messages) inDeg.set(m.name, deps.get(m.name).size);

	const queue = [];
	for (const [name, deg] of inDeg) {
		if (deg === 0) queue.push(name);
	}

	const sorted = [];
	while (queue.length > 0) {
		const curr = queue.shift();
		sorted.push(curr);
		for (const [name, d] of deps) {
			if (d.has(curr)) {
				d.delete(curr);
				inDeg.set(name, inDeg.get(name) - 1);
				if (inDeg.get(name) === 0) {
					queue.push(name);
				}
			}
		}
	}

	return sorted.map((name) => messages[msgIndex.get(name)]);
}

// ── Type Mapping ────────────────────────────────────────────────────────────

function mapType(protoType, enumNames, msgNames) {
	switch (protoType) {
		case 'string':
			return 'z.string()';
		case 'int32':
			return 'z.number().int()';
		case 'int64':
			return 'z.number()';
		case 'float':
			return 'z.number()';
		case 'double':
			return 'z.number()';
		case 'bool':
			return 'z.boolean()';
		case 'kbve.common.Result':
			return 'ResultSchema';
		default:
			if (enumNames.has(protoType)) return `${protoType}Schema`;
			if (msgNames.has(protoType)) return `${protoType}Schema`;
			return `z.unknown() /* unmapped: ${protoType} */`;
	}
}

// ── Emit ────────────────────────────────────────────────────────────────────

function emit(enums, messages) {
	const enumNames = new Set(enums.map((e) => e.name));
	const msgNames = new Set(messages.map((m) => m.name));
	const sorted = topoSort(messages, enumNames);

	const lines = [];

	lines.push('// AUTO-GENERATED from meme.proto — DO NOT EDIT');
	lines.push('// Source: packages/data/proto/meme/meme.proto');
	lines.push('');
	lines.push("import { z } from 'zod';");
	lines.push('');
	lines.push("import { ResultSchema } from '../common.zod';");
	lines.push('');

	// Enums
	lines.push(
		'// ─────────────────────────────────────────────────────────────────────────',
	);
	lines.push('// Enums');
	lines.push(
		'// ─────────────────────────────────────────────────────────────────────────',
	);
	lines.push('');

	for (const e of enums) {
		const valuesName = `${e.name}Values`;
		lines.push(`export const ${valuesName} = [`);
		for (const v of e.values) {
			lines.push(`\t'${v}',`);
		}
		lines.push('] as const;');
		lines.push(`export const ${e.name}Schema = z.enum(${valuesName});`);
		lines.push(`export type ${e.name} = z.infer<typeof ${e.name}Schema>;`);
		lines.push('');
	}

	// Messages
	lines.push(
		'// ─────────────────────────────────────────────────────────────────────────',
	);
	lines.push('// Messages');
	lines.push(
		'// ─────────────────────────────────────────────────────────────────────────',
	);
	lines.push('');

	for (const m of sorted) {
		lines.push(`export const ${m.name}Schema = z.object({`);
		for (const f of m.fields) {
			const base = mapType(f.type, enumNames, msgNames);
			let zodExpr;
			if (f.repeated) {
				zodExpr = `z.array(${base})`;
			} else if (f.optional) {
				zodExpr = `${base}.optional()`;
			} else {
				zodExpr = base;
			}
			lines.push(`\t${f.name}: ${zodExpr},`);
		}
		lines.push('});');
		lines.push(`export type ${m.name} = z.infer<typeof ${m.name}Schema>;`);
		lines.push('');
	}

	return lines.join('\n');
}

// ── Main ────────────────────────────────────────────────────────────────────

const source = readFileSync(PROTO_PATH, 'utf-8');
const { enums, messages } = parseProto(source);
const output = emit(enums, messages);

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, output, 'utf-8');

console.log(
	`Generated ${OUTPUT_PATH} (${enums.length} enums, ${messages.length} messages)`,
);
