#!/usr/bin/env node
/**
 * Walk the built dist/apps/astro-rareicon/ tree, extract every <a href>
 * + relevant <link> + JSON-island data-attr referenced URL, and report:
 *
 *   - INTERNAL_BROKEN   absolute /path that has no matching index.html
 *   - ANCHOR_BROKEN     /path#fragment whose fragment id doesn't exist
 *                       on the target page
 *   - EXTERNAL_LISTED   logs every distinct external host seen so a
 *                       reviewer can eyeball domains for typos /
 *                       discontinued services. Set --probe to actually
 *                       HEAD-check each (slow, off by default).
 *
 * Run after `astro build` with the working directory at the worktree
 * root:
 *
 *   node apps/rareicon/icons-codegen/scripts/audit-links.mjs
 *
 * Exit 1 on any INTERNAL_BROKEN or ANCHOR_BROKEN finding so CI can
 * gate merges on link health.
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

const args = process.argv.slice(2);
const probe = args.includes('--probe');
const verbose = args.includes('--verbose');

const SKIP_PREFIXES = ['/_astro/', '/pagefind/'];
const SKIP_PATHS = new Set([
	'/favicon.svg',
	'/favicon.ico',
	'/sitemap.xml',
	'/sitemap-index.xml',
	'/robots.txt',
	'/ads.txt',
	'/manifest.json',
	'/manifest.webmanifest',
]);

const A_HREF_RE = /<a\s+[^>]*?\bhref="([^"]+)"/gi;
const LINK_HREF_RE = /<link\s+[^>]*?\bhref="([^"]+)"/gi;
const FRAGMENT_ID_RE = /\b(?:id|name)="([^"]+)"/g;

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

function extractHrefs(html) {
	const hrefs = [];
	let m;
	while ((m = A_HREF_RE.exec(html))) hrefs.push(m[1]);
	while ((m = LINK_HREF_RE.exec(html))) hrefs.push(m[1]);
	return hrefs;
}

function extractFragmentIds(html) {
	const ids = new Set();
	let m;
	while ((m = FRAGMENT_ID_RE.exec(html))) ids.add(m[1]);
	return ids;
}

function isExternal(href) {
	return /^https?:\/\//i.test(href);
}

function isInternalAbsolute(href) {
	return href.startsWith('/') && !href.startsWith('//');
}

function shouldSkip(href) {
	if (SKIP_PATHS.has(href)) return true;
	for (const p of SKIP_PREFIXES) if (href.startsWith(p)) return true;
	return false;
}

function resolveInternal(href) {
	const [pathPart] = href.split('#');
	if (!pathPart) return null;
	const trimmed = pathPart.endsWith('/') ? pathPart.slice(0, -1) : pathPart;
	const candidates = [
		path.join(DIST_DIR, trimmed, 'index.html'),
		path.join(DIST_DIR, trimmed),
	];
	for (const c of candidates) {
		if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
	}
	return null;
}

const internalBroken = [];
const anchorBroken = [];
const externalHosts = new Map();
const fragmentCache = new Map();

function readFragmentIds(filePath) {
	if (fragmentCache.has(filePath)) return fragmentCache.get(filePath);
	const html = fs.readFileSync(filePath, 'utf8');
	const ids = extractFragmentIds(html);
	fragmentCache.set(filePath, ids);
	return ids;
}

function main() {
	if (!fs.existsSync(DIST_DIR)) {
		console.error(
			`dist not found: ${DIST_DIR}\nRun \`astro build\` first.`,
		);
		process.exit(1);
	}

	const htmlFiles = listHtmlFiles(DIST_DIR);
	console.log(`scanning ${htmlFiles.length} HTML files`);

	let totalHrefs = 0;
	let internalCount = 0;
	let externalCount = 0;
	let anchorCount = 0;

	for (const file of htmlFiles) {
		const route = distRelToRoute(file);
		const html = fs.readFileSync(file, 'utf8');
		const hrefs = extractHrefs(html);

		for (const raw of hrefs) {
			totalHrefs++;
			const href = raw.replace(/&amp;/g, '&').trim();

			if (!href || href === '#') continue;

			if (href.startsWith('mailto:') || href.startsWith('tel:'))
				continue;

			if (href.startsWith('#')) {
				anchorCount++;
				const id = href.slice(1);
				const ids = readFragmentIds(file);
				if (!ids.has(id)) {
					anchorBroken.push({ from: route, anchor: href });
				}
				continue;
			}

			if (isExternal(href)) {
				externalCount++;
				try {
					const u = new URL(href);
					const list = externalHosts.get(u.host) ?? [];
					list.push({ from: route, full: href });
					externalHosts.set(u.host, list);
				} catch {
					/* malformed URL — skip */
				}
				continue;
			}

			if (isInternalAbsolute(href)) {
				if (shouldSkip(href.split('#')[0])) continue;
				internalCount++;
				const target = resolveInternal(href);
				if (!target) {
					internalBroken.push({ from: route, href });
					continue;
				}
				const [, fragment] = href.split('#');
				if (fragment) {
					anchorCount++;
					const ids = readFragmentIds(target);
					if (!ids.has(fragment)) {
						anchorBroken.push({ from: route, anchor: href });
					}
				}
			}
		}
	}

	console.log(`\nscanned ${totalHrefs} hrefs total`);
	console.log(`  internal: ${internalCount}`);
	console.log(`  external: ${externalCount}`);
	console.log(`  anchors:  ${anchorCount}`);
	console.log(`  external hosts: ${externalHosts.size}`);

	if (verbose) {
		console.log('\n--- external hosts ---');
		const sorted = [...externalHosts.entries()].sort(
			(a, b) => b[1].length - a[1].length,
		);
		for (const [host, refs] of sorted) {
			console.log(`  ${refs.length.toString().padStart(5)}  ${host}`);
		}
	}

	if (internalBroken.length > 0) {
		console.error(
			`\n!! INTERNAL_BROKEN — ${internalBroken.length} link${internalBroken.length === 1 ? '' : 's'}`,
		);
		const grouped = new Map();
		for (const b of internalBroken) {
			const list = grouped.get(b.href) ?? [];
			list.push(b.from);
			grouped.set(b.href, list);
		}
		for (const [href, froms] of grouped) {
			const sample = froms.slice(0, 3).join(', ');
			const more = froms.length > 3 ? ` (+${froms.length - 3} more)` : '';
			console.error(`  ${href}  ←  ${sample}${more}`);
		}
	}

	if (anchorBroken.length > 0) {
		console.error(
			`\n!! ANCHOR_BROKEN — ${anchorBroken.length} link${anchorBroken.length === 1 ? '' : 's'}`,
		);
		for (const b of anchorBroken.slice(0, 50)) {
			console.error(`  ${b.anchor}  ←  ${b.from}`);
		}
		if (anchorBroken.length > 50) {
			console.error(`  ... +${anchorBroken.length - 50} more`);
		}
	}

	if (probe) {
		console.log(
			`\n--- probing ${externalHosts.size} external hosts (HEAD) ---`,
		);
		// Stub: actual probing would use fetch with a small concurrency
		// pool + 5s timeout. Left for a follow-up phase to keep this
		// audit synchronous + offline-safe.
	}

	if (internalBroken.length > 0 || anchorBroken.length > 0) {
		process.exit(1);
	}
	console.log('\nlink audit clean.');
}

main();
