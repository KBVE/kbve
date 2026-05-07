#!/usr/bin/env node
/**
 * Generate IconTerm MDX files from `@tabler/icons` (MIT).
 *
 * Tabler's outline set is broad (5000+) and overlaps heavily with Lucide,
 * so this script only emits a curated whitelist of refs where Tabler
 * offers something Lucide doesn't or where the Tabler glyph reads better
 * for the RareIcon catalog (weapons, fantasy, math, finance edge cases).
 *
 * Hand-crafted lock: if `<ref>.mdx` already exists, the Tabler entry
 * writes to `<ref>-tabler.mdx` instead of overwriting.
 *
 * Generated marker: `tags: [tabler-generated, ...]` so cleanup can
 * round-trip without nuking lucide / simple-icons / hand-crafted files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const ICONS_DIR = path.resolve(__dirname, '../src/content/docs/icons');
const TABLER_OUTLINE_DIR = path.resolve(
	WORKSPACE_ROOT,
	'node_modules/@tabler/icons/icons/outline',
);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noClean = args.includes('--no-clean');

/**
 * Curated whitelist. `slug` matches Tabler's filename (no `.svg`); `ref`
 * is the catalog term ref. Categories follow the existing IconTerm
 * conventions (action / commerce / game / media / nav / social / tech).
 */
const CURATED = [
	// Weapons / fantasy combat
	{ slug: 'sword', ref: 'sword', cat: 'game' },
	{ slug: 'swords', ref: 'swords', cat: 'game' },
	{ slug: 'shield', ref: 'shield', cat: 'game' },
	{ slug: 'shield-half', ref: 'shield-half', cat: 'game' },
	{ slug: 'bow', ref: 'bow', cat: 'game' },
	{ slug: 'wand', ref: 'wand', cat: 'game' },
	{ slug: 'crown', ref: 'crown', cat: 'game' },
	{ slug: 'horse-toy', ref: 'horse-toy', cat: 'game' },
	{ slug: 'campfire', ref: 'campfire', cat: 'game' },
	{ slug: 'tent', ref: 'tent', cat: 'game' },
	{ slug: 'castle', ref: 'castle', cat: 'game' },

	// Currency / commerce
	{ slug: 'currency-dollar', ref: 'currency-dollar', cat: 'commerce' },
	{ slug: 'currency-euro', ref: 'currency-euro', cat: 'commerce' },
	{ slug: 'currency-yen', ref: 'currency-yen', cat: 'commerce' },
	{ slug: 'currency-bitcoin', ref: 'currency-bitcoin', cat: 'commerce' },
	{ slug: 'pig-money', ref: 'pig-money', cat: 'commerce' },
	{ slug: 'cash', ref: 'cash', cat: 'commerce' },
	{ slug: 'coin-bitcoin', ref: 'coin-bitcoin', cat: 'commerce' },

	// Math / science
	{ slug: 'math-pi', ref: 'math-pi', cat: 'tech' },
	{ slug: 'math-integral', ref: 'math-integral', cat: 'tech' },
	{ slug: 'math-sigma', ref: 'math-sigma', cat: 'tech' },
	{ slug: 'math-equal-greater', ref: 'math-equal-greater', cat: 'tech' },
	{ slug: 'square-root', ref: 'square-root', cat: 'tech' },
	{ slug: 'function', ref: 'function', cat: 'tech' },
	{ slug: 'matrix', ref: 'matrix-grid', cat: 'tech' },
	{ slug: 'vector-bezier', ref: 'vector-bezier', cat: 'tech' },

	// Devops / infra
	{ slug: 'brand-docker', ref: 'docker-tabler', cat: 'tech' },
	{ slug: 'brand-kubernetes', ref: 'kubernetes-tabler', cat: 'tech' },
	{ slug: 'brand-aws', ref: 'aws-tabler', cat: 'tech' },
	{ slug: 'brand-cloudflare', ref: 'cloudflare-tabler', cat: 'tech' },
	{ slug: 'brand-vercel', ref: 'vercel-tabler', cat: 'tech' },

	// Music
	{ slug: 'music', ref: 'music', cat: 'media' },
	{ slug: 'music-off', ref: 'music-off', cat: 'media' },
	{ slug: 'guitar-pick', ref: 'guitar-pick', cat: 'media' },
	{ slug: 'piano', ref: 'piano', cat: 'media' },

	// Hardware / IoT
	{ slug: 'cpu', ref: 'cpu', cat: 'tech' },
	{ slug: 'cpu-2', ref: 'cpu-2', cat: 'tech' },
	{ slug: 'router', ref: 'router', cat: 'tech' },
	{ slug: 'antenna', ref: 'antenna', cat: 'tech' },
	{ slug: 'satellite', ref: 'satellite', cat: 'tech' },

	// Misc gamedev-relevant
	{ slug: 'wand', ref: 'magic-wand', cat: 'game' },
	{ slug: 'sparkles', ref: 'sparkles', cat: 'game' },
	{ slug: 'flame', ref: 'flame-tabler', cat: 'game' },
	{ slug: 'ghost-2', ref: 'ghost-2', cat: 'game' },
	{ slug: 'ufo', ref: 'ufo', cat: 'game' },

	// Sports / activity
	{ slug: 'ball-basketball', ref: 'basketball', cat: 'game' },
	{ slug: 'ball-american-football', ref: 'football-american', cat: 'game' },
	{ slug: 'ball-tennis', ref: 'tennis', cat: 'game' },
	{ slug: 'ball-volleyball', ref: 'volleyball-tabler', cat: 'game' },
	{ slug: 'soccer-field', ref: 'soccer-field', cat: 'game' },
	{ slug: 'run', ref: 'run', cat: 'action' },
	{ slug: 'walk', ref: 'walk', cat: 'action' },

	// Mood / emoji
	{ slug: 'mood-happy', ref: 'mood-happy', cat: 'social' },
	{ slug: 'mood-sad', ref: 'mood-sad', cat: 'social' },
	{ slug: 'mood-angry', ref: 'mood-angry', cat: 'social' },
	{ slug: 'mood-neutral', ref: 'mood-neutral', cat: 'social' },
	{ slug: 'mood-crazy-happy', ref: 'mood-crazy-happy', cat: 'social' },

	// AI / robot / future
	{ slug: 'robot', ref: 'robot', cat: 'tech' },
	{ slug: 'robot-face', ref: 'robot-face', cat: 'tech' },
	{ slug: 'brand-openai', ref: 'openai-tabler', cat: 'tech' },
	{ slug: 'brain', ref: 'brain', cat: 'tech' },
	{ slug: 'virtual-reality', ref: 'virtual-reality', cat: 'tech' },
	{ slug: 'augmented-reality', ref: 'augmented-reality', cat: 'tech' },

	// Travel / transit
	{ slug: 'plane-tilt', ref: 'plane-tilt', cat: 'navigation' },
	{ slug: 'helicopter-landing', ref: 'helicopter-landing', cat: 'navigation' },
	{ slug: 'sailboat-2', ref: 'sailboat-2', cat: 'navigation' },
	{ slug: 'submarine', ref: 'submarine', cat: 'navigation' },
	{ slug: 'tram', ref: 'tram', cat: 'navigation' },

	// Food
	{ slug: 'pizza', ref: 'pizza-tabler', cat: 'commerce' },
	{ slug: 'salad', ref: 'salad-tabler', cat: 'commerce' },
	{ slug: 'meat', ref: 'meat', cat: 'commerce' },
	{ slug: 'cake', ref: 'cake-tabler', cat: 'commerce' },
	{ slug: 'ice-cream', ref: 'ice-cream', cat: 'commerce' },

	// Eco / environment
	{ slug: 'leaf', ref: 'leaf-tabler', cat: 'weather' },
	{ slug: 'tree', ref: 'tree-tabler', cat: 'weather' },
	{ slug: 'recycle', ref: 'recycle-tabler', cat: 'weather' },
	{ slug: 'wind-electricity', ref: 'wind-electricity', cat: 'weather' },
	{ slug: 'sun-electricity', ref: 'sun-electricity', cat: 'weather' },
];

function titleCase(str) {
	return str
		.split('-')
		.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ');
}

/**
 * Pull the inner SVG markup out of a Tabler `.svg` file. Tabler ships
 * `<svg>` with class names + a transparent guide path; we strip the
 * wrapper, drop the guide, and re-emit a clean catalog-friendly SVG.
 */
function loadTablerSvgBody(slug) {
	const file = path.join(TABLER_OUTLINE_DIR, `${slug}.svg`);
	if (!fs.existsSync(file)) return null;
	const raw = fs.readFileSync(file, 'utf8');
	const innerMatch = raw.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
	if (!innerMatch) return null;
	// Collapse internal whitespace/newlines so the `svg_body: |` YAML
	// block scalar stays on a single content line — block scalars require
	// every continuation line to match the indent, which Tabler's
	// pretty-printed multi-path markup breaks.
	const inner = innerMatch[1]
		.replace(
			/<path\s+stroke="none"\s+d="M0 0h24v24H0z"\s+fill="none"\s*\/>/g,
			'',
		)
		.replace(/\s+/g, ' ')
		.trim();
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"` +
		` fill="none" stroke="currentColor" stroke-width="2"` +
		` stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
	);
}

function mdxForTerm({ slug, ref, cat }, svgBody) {
	const name = titleCase(ref);
	const keywords = JSON.stringify(
		Array.from(
			new Set([
				ref,
				...ref.split('-').filter((w) => w.length > 1),
				slug,
				name.toLowerCase(),
			]),
		),
	).slice(1, -1);

	return `---
ref: ${ref}
name: ${name}
title: ${name} Icon
description: ${name} glyph from the Tabler Icons library (MIT), 1 variant — outline stroke, recolor via currentColor.
primary_category: ${cat}
categories: [${cat}, library]
tags: [tabler-generated, outline]
search:
  keywords: [${keywords}]
  primary_category: ${cat}
default_license:
  license: mit
  attribution_required: false
  attribution_line: "Tabler Icons (https://tabler.io/icons) — MIT License"
  author: Tabler Icons contributors
  source_url: "https://tabler.io/icons/icon/${slug}"
  commercial_use: true
  modifications_allowed: true
default_offering:
  offering: free
icons:
  - ref: "outline"
    label: "Outline"
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
    tags: [tabler]
    svg_body: |
      ${svgBody}
pagefindFilters: [tabler, ${cat}]
---

import IconTermPanel from '@/components/icons/IconTermPanel.astro';

${name} — outline glyph from the [Tabler Icons library](https://tabler.io/icons) (MIT).

<IconTermPanel
	termRef={frontmatter.ref}
	name={frontmatter.name}
	description={frontmatter.description}
	primary_category={frontmatter.primary_category}
	categories={frontmatter.categories}
	tags={frontmatter.tags}
	default_license={frontmatter.default_license}
	icons={frontmatter.icons}
/>
`;
}

function cleanPreviouslyGenerated() {
	if (!fs.existsSync(ICONS_DIR)) return 0;
	let removed = 0;
	for (const f of fs.readdirSync(ICONS_DIR)) {
		if (!f.endsWith('.mdx') || f === 'index.mdx') continue;
		const p = path.join(ICONS_DIR, f);
		const head = fs.readFileSync(p, 'utf8').slice(0, 800);
		if (/^tags: \[tabler-generated/m.test(head)) {
			if (!dryRun) fs.unlinkSync(p);
			removed++;
		}
	}
	return removed;
}

async function main() {
	if (!fs.existsSync(TABLER_OUTLINE_DIR)) {
		console.error(
			`tabler icons dir not found: ${TABLER_OUTLINE_DIR}\nRun \`pnpm install\` first.`,
		);
		process.exit(1);
	}
	if (!noClean) {
		const removed = cleanPreviouslyGenerated();
		console.log(`cleaned ${removed} previously-generated tabler MDX files`);
	}

	const handCrafted = new Set(
		fs
			.readdirSync(ICONS_DIR)
			.filter((f) => f.endsWith('.mdx') && f !== 'index.mdx')
			.map((f) => f.replace(/\.mdx$/, '')),
	);

	let written = 0;
	let collisionsRenamed = 0;
	let missingSource = 0;

	for (const entry of CURATED) {
		const svg = loadTablerSvgBody(entry.slug);
		if (!svg) {
			console.warn(`  ! source SVG missing: ${entry.slug}`);
			missingSource++;
			continue;
		}
		let finalRef = entry.ref;
		if (handCrafted.has(finalRef)) {
			finalRef = `${entry.ref}-tabler`;
			if (handCrafted.has(finalRef)) continue;
			collisionsRenamed++;
		}
		const mdx = mdxForTerm({ ...entry, ref: finalRef }, svg);
		if (!dryRun) {
			fs.writeFileSync(path.join(ICONS_DIR, `${finalRef}.mdx`), mdx);
		}
		written++;
	}

	console.log(
		`wrote ${written} terms (${collisionsRenamed} collision-renamed), ${missingSource} missing source${dryRun ? ' (dry-run)' : ''}`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
