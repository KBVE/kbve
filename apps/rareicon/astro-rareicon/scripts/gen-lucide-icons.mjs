#!/usr/bin/env node
/**
 * Generate IconTerm MDX files from the `lucide` npm package (ISC license).
 *
 * Iterates every icon in node_modules/lucide/dist/esm/icons/*.js, converts
 * each IconNode tuple array into an inline SVG using `currentColor`, and
 * writes one MDX file per icon into src/content/docs/icons/.
 *
 * Skips files that already exist (hand-crafted terms win over library dump).
 *
 * Usage:
 *   node apps/rareicon/astro-rareicon/scripts/gen-lucide-icons.mjs
 *   node apps/rareicon/astro-rareicon/scripts/gen-lucide-icons.mjs --limit 400
 *   node apps/rareicon/astro-rareicon/scripts/gen-lucide-icons.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const ICONS_DIR = path.resolve(
	__dirname,
	'../src/content/docs/icons',
);
const LUCIDE_ICONS_DIR = path.resolve(
	WORKSPACE_ROOT,
	'node_modules/lucide/dist/esm/icons',
);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

// Skip prefixes that bloat the catalog with near-duplicates. Keep the flag
// here so we can tune curation without touching the body logic.
const SKIP_PREFIXES = [
	'align-', // 24+ layout-alignment variants
];

// Keyword → category buckets. First match wins; order matters.
const CATEGORY_RULES = [
	{
		cat: 'navigation',
		test: (r) =>
			r.startsWith('arrow-') ||
			r.startsWith('chevron-') ||
			r.startsWith('corner-') ||
			r.startsWith('move-') ||
			r.startsWith('redo') ||
			r.startsWith('undo'),
	},
	{
		cat: 'file',
		test: (r) =>
			r.startsWith('file-') ||
			r === 'file' ||
			r.startsWith('folder') ||
			r.startsWith('clipboard') ||
			r.startsWith('archive'),
	},
	{
		cat: 'media',
		test: (r) =>
			r.includes('play') ||
			r.includes('pause') ||
			r.includes('volume') ||
			r.includes('music') ||
			r.includes('video') ||
			r.startsWith('film') ||
			r.startsWith('camera') ||
			r.startsWith('image') ||
			r.startsWith('mic'),
	},
	{
		cat: 'social',
		test: (r) =>
			r.startsWith('user') ||
			r === 'users' ||
			r === 'heart' ||
			r === 'smile' ||
			r === 'frown' ||
			r === 'laugh' ||
			r === 'angry' ||
			r === 'meh',
	},
	{
		cat: 'comms',
		test: (r) =>
			r.startsWith('mail') ||
			r.startsWith('message') ||
			r.startsWith('chat') ||
			r.startsWith('bell') ||
			r.startsWith('phone') ||
			r.startsWith('headphones'),
	},
	{
		cat: 'game',
		test: (r) =>
			r.startsWith('shield') ||
			r.startsWith('sword') ||
			r === 'crosshair' ||
			r === 'target' ||
			r === 'skull' ||
			r === 'swords' ||
			r === 'dices' ||
			r.startsWith('gamepad'),
	},
	{
		cat: 'tech',
		test: (r) =>
			r.startsWith('cloud') ||
			r.startsWith('server') ||
			r.startsWith('database') ||
			r === 'cpu' ||
			r === 'terminal' ||
			r === 'bug' ||
			r.startsWith('code') ||
			r.startsWith('monitor') ||
			r.startsWith('laptop') ||
			r === 'memory-stick' ||
			r === 'hard-drive' ||
			r === 'router' ||
			r === 'ethernet-port' ||
			r === 'usb' ||
			r === 'network',
	},
	{
		cat: 'weather',
		test: (r) =>
			r === 'sun' ||
			r === 'moon' ||
			r.startsWith('cloud-') ||
			r.startsWith('rain') ||
			r.startsWith('snow') ||
			r.startsWith('wind') ||
			r === 'thermometer' ||
			r === 'sunrise' ||
			r === 'sunset' ||
			r === 'tornado' ||
			r === 'umbrella',
	},
	{
		cat: 'commerce',
		test: (r) =>
			r.includes('cart') ||
			r.includes('shopping') ||
			r.includes('bag') ||
			r.includes('coins') ||
			r.includes('wallet') ||
			r.includes('credit-card') ||
			r.includes('banknote') ||
			r.includes('dollar') ||
			r.includes('euro') ||
			r.includes('yen'),
	},
	{
		cat: 'action',
		test: (r) =>
			r.startsWith('plus') ||
			r.startsWith('minus') ||
			r.startsWith('check') ||
			r === 'x' ||
			r === 'edit' ||
			r.startsWith('edit-') ||
			r.startsWith('trash') ||
			r.startsWith('save') ||
			r.startsWith('copy') ||
			r.startsWith('download') ||
			r.startsWith('upload') ||
			r.startsWith('settings') ||
			r.startsWith('share'),
	},
];

function categoryFor(ref) {
	for (const rule of CATEGORY_RULES) {
		if (rule.test(ref)) return rule.cat;
	}
	return 'ui';
}

function titleCase(ref) {
	return ref
		.split('-')
		.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ');
}

function renderAttrs(attrs) {
	return Object.entries(attrs)
		.map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
		.join(' ');
}

function iconNodeToSvg(node) {
	const children = node
		.map(([tag, attrs]) => `<${tag} ${renderAttrs(attrs)}/>`)
		.join('');
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"` +
		` fill="none" stroke="currentColor" stroke-width="2"` +
		` stroke-linecap="round" stroke-linejoin="round">${children}</svg>`
	);
}

function mdxFor(ref, node) {
	const name = titleCase(ref);
	const cat = categoryFor(ref);
	const svg = iconNodeToSvg(node);
	const keywords = Array.from(
		new Set([ref, ...ref.split('-').filter((w) => w.length > 1)]),
	)
		.map((k) => JSON.stringify(k))
		.join(', ');
	const categoriesYaml = `[${cat}, library]`;

	return `---
ref: ${ref}
name: ${name}
title: ${name} Icon
description: ${name} glyph from the Lucide icon library (ISC), outline style, recolor via currentColor.
primary_category: ${cat}
categories: ${categoriesYaml}
tags: [lucide, outline]
search:
  keywords: [${keywords}]
  primary_category: ${cat}
default_license:
  license: isc
  attribution_required: true
  attribution_line: "Lucide (https://lucide.dev/) — ISC License"
  author: Lucide contributors
  source_url: "https://lucide.dev/icons/${ref}"
  commercial_use: true
  modifications_allowed: true
default_offering:
  offering: free
icons:
  - ref: outline
    label: Outline
    style: outline
    format: svg
    viewbox: { min_x: 0, min_y: 0, width: 24, height: 24 }
    render:
      uses_current_color: true
      monochrome: true
      stroke_width: 2
      stroke_cap: round
      stroke_join: round
    recommended_sizes: [16, 20, 24, 32]
    tags: [lucide]
    svg_body: |
      ${svg}
pagefindFilters: [lucide, ${cat}]
---

import IconTermPanel from '@/components/icons/IconTermPanel.astro';

${name} — outline glyph from the [Lucide icon library](https://lucide.dev/) (ISC).

<IconTermPanel
	termRef={frontmatter.ref}
	name={frontmatter.name}
	description={frontmatter.description}
	primary_category={frontmatter.primary_category}
	categories={frontmatter.categories}
	tags={frontmatter.tags}
	icons={frontmatter.icons}
/>
`;
}

async function main() {
	if (!fs.existsSync(LUCIDE_ICONS_DIR)) {
		console.error(`lucide icons dir not found: ${LUCIDE_ICONS_DIR}`);
		process.exit(1);
	}
	if (!fs.existsSync(ICONS_DIR)) {
		fs.mkdirSync(ICONS_DIR, { recursive: true });
	}

	const existingRefs = new Set(
		fs
			.readdirSync(ICONS_DIR)
			.filter((f) => f.endsWith('.mdx') && f !== 'index.mdx')
			.map((f) => f.replace(/\.mdx$/, '')),
	);

	const iconFiles = fs
		.readdirSync(LUCIDE_ICONS_DIR)
		.filter((f) => f.endsWith('.js') && !f.endsWith('.map.js'))
		.filter((f) => !f.endsWith('.js.map'))
		.map((f) => f.replace(/\.js$/, ''))
		.sort();

	console.log(`lucide corpus: ${iconFiles.length} icons`);
	console.log(`existing terms: ${existingRefs.size}`);

	let added = 0;
	let skipped = 0;
	let skippedPrefix = 0;

	for (const ref of iconFiles) {
		if (added >= limit) break;
		if (SKIP_PREFIXES.some((p) => ref.startsWith(p))) {
			skippedPrefix++;
			continue;
		}
		if (existingRefs.has(ref)) {
			skipped++;
			continue;
		}

		const iconPath = path.join(LUCIDE_ICONS_DIR, `${ref}.js`);
		const mod = await import(iconPath);
		const node = mod.default;
		if (!Array.isArray(node)) {
			console.warn(`skip ${ref}: unexpected export shape`);
			continue;
		}

		const mdx = mdxFor(ref, node);
		if (!dryRun) {
			fs.writeFileSync(path.join(ICONS_DIR, `${ref}.mdx`), mdx);
		}
		added++;
	}

	console.log(
		`added ${added}, skipped existing ${skipped}, skipped-by-prefix ${skippedPrefix}${dryRun ? ' (dry-run)' : ''}`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
