#!/usr/bin/env node
/**
 * Unions the e2e (istanbul, browser) and unit (v8, vitest) lcov reports by
 * source line, then prints the combined line coverage. Each file's lines take
 * the max hit-count across both suites, so logic covered by either stream
 * counts once. Writes a merged lcov for CI/codecov.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

const SOURCES = [
	resolve(root, 'test-results/monocart/coverage/lcov.info'),
	resolve(here, '../astro-cryptothrone/coverage/unit/lcov.info'),
];

const norm = (sf) => {
	const i = sf.lastIndexOf('/src/');
	return i >= 0 ? sf.slice(i + 1) : sf;
};

const files = new Map();

for (const path of SOURCES) {
	if (!existsSync(path)) {
		console.warn(`skip (missing): ${path}`);
		continue;
	}
	for (const record of readFileSync(path, 'utf-8').split('end_of_record')) {
		const sf = record.match(/SF:(.*)/)?.[1];
		if (!sf) continue;
		const key = norm(sf.trim());
		if (!files.has(key)) files.set(key, new Map());
		const lines = files.get(key);
		for (const m of record.matchAll(/DA:(\d+),(\d+)/g)) {
			const ln = Number(m[1]);
			const hits = Number(m[2]);
			lines.set(ln, Math.max(lines.get(ln) ?? 0, hits));
		}
	}
}

let totalLF = 0;
let totalLH = 0;
const out = [];
for (const [file, lines] of [...files].sort()) {
	let lf = 0;
	let lh = 0;
	out.push(`SF:${file}`);
	for (const [ln, hits] of [...lines].sort((a, b) => a[0] - b[0])) {
		out.push(`DA:${ln},${hits}`);
		lf += 1;
		if (hits > 0) lh += 1;
	}
	out.push(`LF:${lf}`, `LH:${lh}`, 'end_of_record');
	totalLF += lf;
	totalLH += lh;
}

writeFileSync(
	resolve(root, 'test-results/coverage-merged.lcov'),
	out.join('\n') + '\n',
);

const pct = totalLF ? (totalLH / totalLF) * 100 : 0;
console.log(
	`\nMerged line coverage: ${pct.toFixed(2)}% (${totalLH}/${totalLF}) across ${files.size} files\n`,
);

const min = Number(process.env.COVERAGE_MERGED_MIN ?? '0');
if (pct < min) {
	console.error(`Merged coverage below ${min}%`);
	process.exit(1);
}
