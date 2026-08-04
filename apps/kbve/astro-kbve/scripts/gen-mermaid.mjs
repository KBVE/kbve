/**
 * gen-mermaid
 *
 * Bakes every ```mermaid fence in `src/content` into committed SVG, once, so
 * the site ships zero mermaid JavaScript. Diagrams are keyed by a content hash
 * of their source, rendered in both Starlight themes, and written to
 * `src/generated/mermaid/`. `remark-mermaid-baked` inlines them at build time.
 *
 * Rendering needs a real browser (mermaid measures text via getBBox, which
 * jsdom does not implement), so this spawns Chromium through Playwright.
 * That cost is paid here, not on every build.
 *
 * Usage:
 *   node scripts/gen-mermaid.mjs           # render missing diagrams, prune orphans
 *   node scripts/gen-mermaid.mjs --check   # exit 1 if anything is missing or stale
 *   node scripts/gen-mermaid.mjs --force   # re-render everything
 */

import { createHash } from 'node:crypto';
import {
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, '..');
const CONTENT_DIR = join(APP_ROOT, 'src/content');
const OUT_DIR = join(APP_ROOT, 'src/generated/mermaid');
const MANIFEST = join(OUT_DIR, 'manifest.json');
const CACHE_DIR = join(HERE, '.cache');

const CHECK = process.argv.includes('--check');
const FORCE = process.argv.includes('--force');

/**
 * Theme ids handed to `mermaid.initialize`. These mirror what astro-mermaid
 * resolved at runtime from Starlight's `data-theme`, so baked output matches
 * what the site rendered before.
 */
const THEMES = { light: 'default', dark: 'dark' };

/** Kept in sync with the `mermaidConfig` that used to live in astro.config.mjs. */
const MERMAID_CONFIG = {
	startOnLoad: false,
	flowchart: { curve: 'basis' },
	gitGraph: {
		mainBranchName: 'main',
		showCommitLabel: true,
		showBranches: true,
		rotateCommitLabel: true,
	},
};

const MERMAID_VERSION = require('mermaid/package.json').version;

/** Joins the hash inputs. Duplicated verbatim in `remark-mermaid-baked`. */
const HASH_SEPARATOR = '::mermaid::';

function walk(dir, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (/\.mdx?$/.test(entry.name)) out.push(full);
	}
	return out;
}

/**
 * Parses a document and returns its mermaid fences. Uses remark rather than a
 * regex so a mermaid fence nested inside a wider ```` fence (a docs page
 * showing mermaid syntax) is not mistaken for a real diagram.
 *
 * @param {string} source
 * @returns {string[]}
 */
function extractDiagrams(source) {
	const tree = unified().use(remarkParse).parse(source);
	const found = [];
	visit(tree, 'code', (node) => {
		if (node.lang === 'mermaid') found.push(node.value);
	});
	return found;
}

/**
 * Diagram identity. `remark-mermaid-baked` recomputes this from the manifest's
 * recorded version and config, so the two must agree byte for byte — hence the
 * spelled-out separator rather than an inline template literal.
 *
 * @param {string} definition
 */
function hashOf(definition) {
	return createHash('sha256')
		.update(
			[MERMAID_VERSION, JSON.stringify(MERMAID_CONFIG), definition].join(
				HASH_SEPARATOR,
			),
		)
		.digest('hex')
		.slice(0, 16);
}

/**
 * Bundles mermaid into a single IIFE the browser can evaluate directly. The
 * published package is ESM-with-chunks, which will not load over `file://`.
 * Cached under `scripts/.cache/` (already gitignored) and keyed by version.
 */
async function bundleMermaid() {
	mkdirSync(CACHE_DIR, { recursive: true });
	const cached = join(CACHE_DIR, `mermaid-${MERMAID_VERSION}.iife.js`);
	try {
		return readFileSync(cached, 'utf-8');
	} catch {
		// Not cached yet — fall through and build it.
	}
	const esbuild = await import('esbuild');
	const result = await esbuild.build({
		stdin: {
			contents: `export { default } from 'mermaid';`,
			resolveDir: APP_ROOT,
			loader: 'js',
		},
		bundle: true,
		format: 'iife',
		globalName: '__mermaidNS',
		platform: 'browser',
		target: 'chrome120',
		minify: true,
		write: false,
		legalComments: 'none',
	});
	const code = result.outputFiles[0].text;
	writeFileSync(cached, code);
	return code;
}

/**
 * @param {Array<{ hash: string, definition: string }>} jobs
 * @returns {Promise<Map<string, Record<string, string>>>} hash -> { light, dark }
 */
async function render(jobs) {
	const { chromium } = await import('@playwright/test');
	const bundle = await bundleMermaid();

	let browser;
	for (const channel of ['chrome', 'msedge', undefined]) {
		try {
			browser = await chromium.launch(channel ? { channel } : {});
			break;
		} catch {
			// Try the next available Chromium build.
		}
	}
	if (!browser) {
		throw new Error(
			'gen-mermaid: no Chromium available. Install one with `npx playwright install chromium`.',
		);
	}

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.setContent('<!doctype html><html><body></body></html>');
	await page.addScriptTag({ content: bundle });

	const out = new Map();
	try {
		for (const [name, theme] of Object.entries(THEMES)) {
			const svgs = await page.evaluate(
				async ({ jobs, theme, config, name }) => {
					const mermaid = window.__mermaidNS.default;
					mermaid.initialize({ ...config, theme });
					const results = {};
					for (const job of jobs) {
						const { svg } = await mermaid.render(
							`mermaid-${job.hash}-${name}`,
							job.definition,
						);
						results[job.hash] = svg;
					}
					return results;
				},
				{ jobs, theme, config: MERMAID_CONFIG, name },
			);
			for (const [hash, svg] of Object.entries(svgs)) {
				if (!out.has(hash)) out.set(hash, {});
				out.get(hash)[name] = svg;
			}
		}
	} finally {
		await browser.close();
	}
	return out;
}

const files = walk(CONTENT_DIR).sort();

/** hash -> { definition, usedIn: string[] } */
const wanted = new Map();
for (const file of files) {
	const rel = relative(APP_ROOT, file);
	for (const definition of extractDiagrams(readFileSync(file, 'utf-8'))) {
		const hash = hashOf(definition);
		const entry = wanted.get(hash) ?? { definition, usedIn: [] };
		if (!entry.usedIn.includes(rel)) entry.usedIn.push(rel);
		wanted.set(hash, entry);
	}
}

mkdirSync(OUT_DIR, { recursive: true });

const svgPath = (hash, theme) => join(OUT_DIR, `${hash}.${theme}.svg`);
const exists = (p) => {
	try {
		return statSync(p).isFile();
	} catch {
		return false;
	}
};
const hasAllThemes = (hash) =>
	Object.keys(THEMES).every((t) => exists(svgPath(hash, t)));

const stale = [...wanted.keys()].filter((hash) => FORCE || !hasAllThemes(hash));

let previousManifest = {};
try {
	previousManifest = JSON.parse(readFileSync(MANIFEST, 'utf-8'));
} catch {
	// No manifest yet — treat as empty.
}

const orphans = readdirSync(OUT_DIR)
	.filter((f) => f.endsWith('.svg'))
	.filter((f) => !wanted.has(f.split('.')[0]));

if (CHECK) {
	const problems = [];
	if (stale.length > 0) {
		for (const hash of stale) {
			problems.push(
				`missing SVG for ${hash} (used in ${wanted.get(hash).usedIn.join(', ')})`,
			);
		}
	}
	for (const f of orphans) problems.push(`orphaned ${f}`);
	if (previousManifest.mermaidVersion !== MERMAID_VERSION) {
		problems.push(
			`manifest built with mermaid ${previousManifest.mermaidVersion ?? 'unknown'}, installed is ${MERMAID_VERSION}`,
		);
	}
	if (problems.length > 0) {
		console.error('gen-mermaid --check failed:');
		for (const p of problems) console.error(`  - ${p}`);
		console.error('\nRun: pnpm nx run astro-kbve:gen:mermaid');
		process.exit(1);
	}
	console.log(`gen-mermaid: ${wanted.size} diagrams up to date.`);
	process.exit(0);
}

if (stale.length > 0) {
	console.log(
		`gen-mermaid: rendering ${stale.length} diagram(s) with mermaid ${MERMAID_VERSION}…`,
	);
	const rendered = await render(
		stale.map((hash) => ({ hash, definition: wanted.get(hash).definition })),
	);
	for (const [hash, byTheme] of rendered) {
		for (const [theme, svg] of Object.entries(byTheme)) {
			writeFileSync(svgPath(hash, theme), svg);
		}
	}
} else {
	console.log('gen-mermaid: all diagrams cached.');
}

for (const f of orphans) {
	rmSync(join(OUT_DIR, f));
	console.log(`gen-mermaid: pruned ${f}`);
}

const manifest = {
	mermaidVersion: MERMAID_VERSION,
	config: MERMAID_CONFIG,
	themes: Object.keys(THEMES),
	diagrams: Object.fromEntries(
		[...wanted.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([hash, entry]) => [
				hash,
				{ usedIn: entry.usedIn.sort(), source: entry.definition },
			]),
	),
};
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
	`gen-mermaid: ${wanted.size} diagram(s) across ${files.length} file(s) → src/generated/mermaid/`,
);
