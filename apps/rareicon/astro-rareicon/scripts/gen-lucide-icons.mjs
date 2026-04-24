#!/usr/bin/env node
/**
 * Generate IconTerm MDX files from the `lucide` npm package (ISC license).
 *
 * Icons are grouped by root prefix — e.g. `bookmark`, `bookmark-plus`,
 * `bookmark-check`, `bookmark-x` collapse into one `bookmark.mdx` with each
 * suffix becoming a variant in the `icons:` array. Standalone icons (root
 * group size 1) emit as their own term.
 *
 * Hand-crafted terms (existing MDX in src/content/docs/icons/) win:
 * - If `<root>.mdx` already exists as hand-crafted, the entire lucide group
 *   is skipped so user-curated content stays intact.
 * - Previously-generated lucide MDX (detected via `tags: [lucide` in the
 *   frontmatter) is deleted before regen.
 *
 * Usage:
 *   node apps/rareicon/astro-rareicon/scripts/gen-lucide-icons.mjs
 *   node apps/rareicon/astro-rareicon/scripts/gen-lucide-icons.mjs --limit 400
 *   node apps/rareicon/astro-rareicon/scripts/gen-lucide-icons.mjs --dry-run
 *   node apps/rareicon/astro-rareicon/scripts/gen-lucide-icons.mjs --no-clean
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const ICONS_DIR = path.resolve(__dirname, '../src/content/docs/icons');
const LUCIDE_ICONS_DIR = path.resolve(
	WORKSPACE_ROOT,
	'node_modules/lucide/dist/esm/icons',
);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noClean = args.includes('--no-clean');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

// Skip prefixes that bloat the catalog with low-value entries.
const SKIP_PREFIXES = [
	'align-', // 24+ layout-alignment variants
	'a-', // single-char font-type icons
];

// Keyword → category buckets. First match wins; order matters.
const CATEGORY_RULES = [
	{
		cat: 'navigation',
		test: (r) =>
			r.startsWith('arrow') ||
			r.startsWith('chevron') ||
			r.startsWith('corner') ||
			r.startsWith('move') ||
			r.startsWith('redo') ||
			r.startsWith('undo'),
	},
	{
		cat: 'file',
		test: (r) =>
			r.startsWith('file') ||
			r.startsWith('folder') ||
			r.startsWith('clipboard') ||
			r.startsWith('archive') ||
			r.startsWith('book'),
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
			r.startsWith('heart') ||
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

function titleCase(str) {
	return str
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

/**
 * Build an IconTerm variant block YAML for a single lucide entry.
 *
 * @param variantRef slug unique within the parent term (e.g. "outline",
 *   "plus", "off", "ring"). Must be URL-safe.
 */
function variantYaml(variantRef, label, node) {
	const svg = iconNodeToSvg(node);
	return `  - ref: ${JSON.stringify(variantRef)}
    label: ${JSON.stringify(label)}
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
`;
}

/**
 * Emit MDX for a term composed of one or more lucide variants.
 *
 * @param root canonical term slug (e.g. "bookmark")
 * @param entries array of { suffix, node } where suffix is the slug suffix
 *   after the root ("plus", "check", or empty string for the base variant).
 */
function mdxForGroup(root, entries) {
	const name = titleCase(root);
	const cat = categoryFor(root);
	const variants = entries
		.map(({ suffix, node }) => {
			const variantRef = suffix === '' ? 'outline' : suffix;
			const label = suffix === '' ? 'Outline' : titleCase(suffix);
			return variantYaml(variantRef, label, node);
		})
		.join('');
	const keywords = Array.from(
		new Set([
			root,
			...root.split('-').filter((w) => w.length > 1),
			...entries.map((e) => e.suffix).filter(Boolean),
		]),
	)
		.map((k) => JSON.stringify(k))
		.join(', ');
	const categoriesYaml = `[${cat}, library]`;

	return `---
ref: ${root}
name: ${name}
title: ${name} Icon
description: ${name} glyph set from the Lucide icon library (ISC), ${entries.length} variant${entries.length === 1 ? '' : 's'} — outline stroke, recolor via currentColor.
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
  source_url: "https://lucide.dev/icons/${root}"
  commercial_use: true
  modifications_allowed: true
default_offering:
  offering: free
icons:
${variants}pagefindFilters: [lucide, ${cat}]
---

import IconTermPanel from '@/components/icons/IconTermPanel.astro';

${name} — ${entries.length === 1 ? 'outline glyph' : `${entries.length} variants`} from the [Lucide icon library](https://lucide.dev/) (ISC).

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

function loadLucideRefs() {
	return fs
		.readdirSync(LUCIDE_ICONS_DIR)
		.filter((f) => f.endsWith('.js') && !f.endsWith('.map.js'))
		.filter((f) => !f.endsWith('.js.map'))
		.map((f) => f.replace(/\.js$/, ''))
		.sort();
}

function groupByRoot(refs) {
	const groups = new Map();
	for (const ref of refs) {
		const dashIdx = ref.indexOf('-');
		const root = dashIdx === -1 ? ref : ref.slice(0, dashIdx);
		const suffix = dashIdx === -1 ? '' : ref.slice(dashIdx + 1);
		if (!groups.has(root)) groups.set(root, []);
		groups.get(root).push({ ref, suffix });
	}
	return groups;
}

function cleanPreviouslyGenerated() {
	const dir = ICONS_DIR;
	if (!fs.existsSync(dir)) return 0;
	let removed = 0;
	for (const f of fs.readdirSync(dir)) {
		if (!f.endsWith('.mdx') || f === 'index.mdx') continue;
		const p = path.join(dir, f);
		const head = fs.readFileSync(p, 'utf8').slice(0, 600);
		// Generator-authored files carry `tags: [lucide` at the top-level tags
		// field; hand-crafted files do not.
		if (/^tags: \[lucide/m.test(head)) {
			if (!dryRun) fs.unlinkSync(p);
			removed++;
		}
	}
	return removed;
}

async function main() {
	if (!fs.existsSync(LUCIDE_ICONS_DIR)) {
		console.error(`lucide icons dir not found: ${LUCIDE_ICONS_DIR}`);
		process.exit(1);
	}
	if (!fs.existsSync(ICONS_DIR)) {
		fs.mkdirSync(ICONS_DIR, { recursive: true });
	}

	if (!noClean) {
		const removed = cleanPreviouslyGenerated();
		console.log(`cleaned ${removed} previously-generated MDX files`);
	}

	const handCraftedRefs = new Set(
		fs
			.readdirSync(ICONS_DIR)
			.filter((f) => f.endsWith('.mdx') && f !== 'index.mdx')
			.map((f) => f.replace(/\.mdx$/, '')),
	);

	const allRefs = loadLucideRefs().filter(
		(r) => !SKIP_PREFIXES.some((p) => r.startsWith(p)),
	);
	const groups = groupByRoot(allRefs);

	console.log(`lucide corpus: ${allRefs.length} refs in ${groups.size} root groups`);
	console.log(`hand-crafted refs (locked): ${handCraftedRefs.size}`);

	let termsAdded = 0;
	let variantsAdded = 0;
	let skippedHandCrafted = 0;
	const groupEntries = Array.from(groups.entries()).sort(([a], [b]) =>
		a.localeCompare(b),
	);

	for (const [root, members] of groupEntries) {
		if (termsAdded >= limit) break;
		if (handCraftedRefs.has(root)) {
			skippedHandCrafted++;
			continue;
		}

		// Sort: base (no suffix) first, then alphabetical.
		members.sort((a, b) => {
			if (a.suffix === '' && b.suffix !== '') return -1;
			if (a.suffix !== '' && b.suffix === '') return 1;
			return a.suffix.localeCompare(b.suffix);
		});

		const entries = [];
		for (const { ref, suffix } of members) {
			const mod = await import(path.join(LUCIDE_ICONS_DIR, `${ref}.js`));
			const node = mod.default;
			if (!Array.isArray(node)) continue;
			entries.push({ suffix, node });
		}
		if (entries.length === 0) continue;

		const mdx = mdxForGroup(root, entries);
		if (!dryRun) {
			fs.writeFileSync(path.join(ICONS_DIR, `${root}.mdx`), mdx);
		}
		termsAdded++;
		variantsAdded += entries.length;
	}

	console.log(
		`wrote ${termsAdded} terms (${variantsAdded} variants total), skipped ${skippedHandCrafted} hand-crafted root groups${dryRun ? ' (dry-run)' : ''}`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
