#!/usr/bin/env node
/**
 * Walk dist/apps/astro-rareicon/, parse every
 * <script type="application/ld+json">…</script>, and validate:
 *
 *   - JSON parses cleanly
 *   - Object has @context (must be schema.org URL)
 *   - Object has @type
 *
 * Reports per-page failures + summary counts. Exits 1 on any parse
 * error so CI can gate on structured-data health alongside
 * audit-links.mjs from phase 26.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const DIST_DIR = path.resolve(
	WORKSPACE_ROOT,
	'dist/apps/astro-rareicon',
);

const JSONLD_RE =
	/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

function listHtmlFiles(dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) listHtmlFiles(p, out);
		else if (e.isFile() && e.name.endsWith('.html')) out.push(p);
	}
	return out;
}

function distRelToRoute(filePath) {
	const rel = path.relative(DIST_DIR, filePath);
	const noIndex = rel.replace(/\/?index\.html$/, '/');
	return '/' + noIndex.replace(/\/+$/, '/');
}

function main() {
	if (!fs.existsSync(DIST_DIR)) {
		console.error(`dist not found: ${DIST_DIR}\nRun \`astro build\` first.`);
		process.exit(1);
	}

	const htmlFiles = listHtmlFiles(DIST_DIR);
	console.log(`scanning ${htmlFiles.length} HTML files for JSON-LD blocks`);

	let totalScripts = 0;
	let totalPagesWithLd = 0;
	const typeCounts = new Map();
	const errors = [];

	for (const file of htmlFiles) {
		const route = distRelToRoute(file);
		const html = fs.readFileSync(file, 'utf8');
		const scripts = [];
		let m;
		while ((m = JSONLD_RE.exec(html))) scripts.push(m[1]);
		if (scripts.length === 0) continue;
		totalPagesWithLd++;
		totalScripts += scripts.length;

		for (const raw of scripts) {
			let parsed;
			try {
				parsed = JSON.parse(raw);
			} catch (e) {
				errors.push({
					route,
					reason: `invalid JSON (${e.message})`,
					sample: raw.slice(0, 80),
				});
				continue;
			}
			if (!parsed || typeof parsed !== 'object') {
				errors.push({ route, reason: 'not an object', sample: '' });
				continue;
			}
			const ctx = parsed['@context'];
			if (!ctx || !/schema\.org/.test(String(ctx))) {
				errors.push({
					route,
					reason: `missing or non-schema.org @context: ${JSON.stringify(ctx)}`,
					sample: '',
				});
				continue;
			}
			const type = parsed['@type'];
			if (!type) {
				errors.push({ route, reason: 'missing @type', sample: '' });
				continue;
			}
			const typeStr = Array.isArray(type) ? type.join(',') : String(type);
			typeCounts.set(typeStr, (typeCounts.get(typeStr) ?? 0) + 1);
		}
	}

	console.log(`\nscanned ${totalScripts} JSON-LD blocks across ${totalPagesWithLd} pages`);
	console.log('\n--- @type distribution ---');
	const sorted = [...typeCounts.entries()].sort((a, b) => b[1] - a[1]);
	for (const [type, count] of sorted) {
		console.log(`  ${count.toString().padStart(6)}  ${type}`);
	}

	if (errors.length > 0) {
		console.error(
			`\n!! INVALID — ${errors.length} JSON-LD block${errors.length === 1 ? '' : 's'}`,
		);
		for (const e of errors.slice(0, 25)) {
			console.error(`  ${e.route}  ${e.reason}`);
			if (e.sample) console.error(`    sample: ${e.sample}`);
		}
		if (errors.length > 25) {
			console.error(`  ... +${errors.length - 25} more`);
		}
		process.exit(1);
	}

	console.log('\nJSON-LD audit clean.');
}

main();
