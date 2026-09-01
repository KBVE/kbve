#!/usr/bin/env node
/**
 * Fail when a content `id` in the MDX source of truth is not a real ULID.
 *
 * The registries in `packages/proto` carry ids as `kbve.type.v1.Ulid` -- the 16 raw bytes
 * rather than the 26-character Crockford text -- so an id that cannot be decoded cannot be
 * encoded into an artifact at all. That constraint is new. The catalog was authored against
 * a schema where `id` was a plain string, and 77 of 439 ids had a word spelled into them
 * (`01KTVTRAB1CINDERBRAND00000`, `01KSAVZ000000000000000MONK`), which Crockford rejects:
 * it has no I, L, O or U, so nothing reads as a digit by mistake. Others ran to 27-29
 * characters, or set bits above the 128 a ULID holds.
 *
 * Nothing reads these ids by value -- lookups go through `ref` -- so `--fix` rewrites the
 * invalid ones in place. It keeps the author's 10-character timestamp prefix whenever that
 * prefix is itself decodable, so ids stay grouped in time, and redraws only the 16 random
 * characters. New ids are checked against every id in the catalog before being written.
 *
 * Usage:
 *   node packages/data/codegen/check-ulids.mjs          # report, exit 1 if any are invalid
 *   node packages/data/codegen/check-ulids.mjs --fix    # rewrite the invalid ones
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const contentRoot = resolve(repoRoot, 'apps/kbve/astro-kbve/src/content/docs');
const CATALOGS = [
	'mapdb',
	'npcdb',
	'itemdb',
	'questdb',
	'professiondb',
	'spelldb',
];

const fix = process.argv.includes('--fix');

function invalidReason(text) {
	if (typeof text !== 'string' || text.length !== 26) {
		return `length ${text?.length ?? 0}, want 26`;
	}
	let bits = 0n;
	for (const ch of text.toUpperCase()) {
		const value = CROCKFORD.indexOf(ch);
		if (value < 0) return `'${ch}' is not Crockford Base32`;
		bits = (bits << 5n) | BigInt(value);
	}
	// 26 characters carry 130 bits; the top two are padding and must be zero,
	// which is what makes the value fit in 16 bytes.
	if (bits >> 128n) return 'overflows 128 bits';
	return null;
}

function encodeTime(ms) {
	let out = '';
	let value = BigInt(Math.floor(ms));
	for (let i = 0; i < 10; i++) {
		out = CROCKFORD[Number(value & 31n)] + out;
		value >>= 5n;
	}
	return out;
}

function randomSuffix() {
	let bits = 0n;
	for (const byte of randomBytes(10)) bits = (bits << 8n) | BigInt(byte);
	let out = '';
	for (let i = 0; i < 16; i++) {
		out = CROCKFORD[Number(bits & 31n)] + out;
		bits >>= 5n;
	}
	return out;
}

function timePrefix(old, file) {
	const head = String(old ?? '')
		.slice(0, 10)
		.toUpperCase();
	const decodable =
		head.length === 10 &&
		[...head].every((c) => CROCKFORD.includes(c)) &&
		CROCKFORD.indexOf(head[0]) < 8;
	return decodable ? head : encodeTime(statSync(file).mtimeMs);
}

function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = resolve(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full));
		else if (entry.name.endsWith('.mdx')) out.push(full);
	}
	return out;
}

function collect() {
	const entries = [];
	for (const catalog of CATALOGS) {
		for (const file of walk(resolve(contentRoot, catalog)).sort()) {
			const source = readFileSync(file, 'utf8');
			const frontmatter = source.match(/^---\n([\s\S]*?)\n---/);
			if (!frontmatter) continue;
			const line = frontmatter[1].match(/^id:\s*(.+)$/m);
			if (!line) continue;
			const raw = line[1].trim();
			entries.push({
				catalog,
				file,
				source,
				id: raw.replace(/^['"]|['"]$/g, ''),
				quote: raw.startsWith("'") ? "'" : '"',
			});
		}
	}
	return entries;
}

function main() {
	const entries = collect();
	const taken = new Set(
		entries.filter((e) => !invalidReason(e.id)).map((e) => e.id),
	);
	const invalid = entries.filter((e) => invalidReason(e.id));

	for (const entry of invalid) {
		const reason = invalidReason(entry.id);
		const where = relative(repoRoot, entry.file);
		if (!fix) {
			console.error(`  ✗ ${entry.id} — ${reason}  (${where})`);
			continue;
		}
		let next;
		do {
			next = timePrefix(entry.id, entry.file) + randomSuffix();
		} while (taken.has(next));
		taken.add(next);
		const rewritten = entry.source.replace(
			/^id:\s*.+$/m,
			`id: ${entry.quote}${next}${entry.quote}`,
		);
		if (rewritten === entry.source) {
			console.error(`FATAL: could not rewrite the id in ${where}`);
			process.exit(1);
		}
		writeFileSync(entry.file, rewritten);
		console.log(`  ${entry.id} → ${next}  (${where})`);
	}

	if (invalid.length === 0) {
		console.log(`All ${entries.length} content ids are valid ULIDs.`);
		return;
	}
	if (fix) {
		console.log(`\nRewrote ${invalid.length} of ${entries.length} ids.`);
		console.log(
			'Regenerate the data artifacts so the games pick the new ids up.',
		);
		return;
	}
	console.error(
		`\n${invalid.length} of ${entries.length} content ids are not ULIDs.`,
	);
	console.error(
		'The registries in packages/proto carry ids as kbve.type.v1.Ulid (16 raw bytes),',
	);
	console.error(
		'so these cannot be encoded. Run with --fix to rewrite them, then regenerate.',
	);
	process.exit(1);
}

main();
