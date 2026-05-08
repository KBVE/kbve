#!/usr/bin/env node
/**
 * Generate IconTerm MDX files from `@phosphor-icons/core` (MIT).
 *
 * Phosphor's hook is multi-weight: every glyph ships in 6 visual weights
 * (thin / light / regular / bold / fill / duotone). This script emits one
 * IconTerm per curated slug with all 6 weights as variants on the term —
 * gives the catalog the variant richness it lacks for Lucide-only refs.
 *
 * Hand-crafted lock: existing `<ref>.mdx` writes to `<ref>-phosphor.mdx`.
 *
 * Generated marker: `tags: [phosphor-generated, ...]` so cleanup
 * round-trips cleanly without touching other packs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const ICONS_DIR = path.resolve(WORKSPACE_ROOT, 'apps/rareicon/astro-rareicon/src/content/docs/icons');
const PHOSPHOR_DIR = path.resolve(PACKAGE_ROOT, 'node_modules/@phosphor-icons/core/assets');
const WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'];

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noClean = args.includes('--no-clean');

/**
 * Curated whitelist. Phosphor has 1500+ unique glyphs; whitelist the
 * subset where multi-weight variants offer the most catalog value (UI
 * staples + gamedev / fantasy / medical / weather where rendering style
 * actually changes the feel of the icon).
 */
const CURATED = [
	// Combat / fantasy
	{ slug: 'sword', ref: 'sword', cat: 'game' },
	{ slug: 'shield', ref: 'shield', cat: 'game' },
	{ slug: 'crown', ref: 'crown', cat: 'game' },
	{ slug: 'crown-simple', ref: 'crown-simple', cat: 'game' },
	{ slug: 'dagger', ref: 'dagger', cat: 'game' },
	{ slug: 'gavel', ref: 'gavel', cat: 'game' },
	{ slug: 'axe', ref: 'axe', cat: 'game' },
	{ slug: 'magic-wand', ref: 'magic-wand-phosphor', cat: 'game' },
	{ slug: 'skull', ref: 'skull', cat: 'game' },
	{ slug: 'ghost', ref: 'ghost', cat: 'game' },
	{ slug: 'flame', ref: 'flame', cat: 'game' },
	{ slug: 'lightning', ref: 'lightning', cat: 'game' },
	{ slug: 'lightning-slash', ref: 'lightning-slash', cat: 'game' },
	{ slug: 'crosshair', ref: 'crosshair', cat: 'game' },
	{ slug: 'crosshair-simple', ref: 'crosshair-simple', cat: 'game' },
	{ slug: 'target', ref: 'target', cat: 'game' },
	{ slug: 'trophy', ref: 'trophy', cat: 'game' },
	{ slug: 'medal', ref: 'medal', cat: 'game' },

	// Player / character
	{ slug: 'user', ref: 'user', cat: 'social' },
	{ slug: 'user-circle', ref: 'user-circle', cat: 'social' },
	{ slug: 'users', ref: 'users', cat: 'social' },
	{ slug: 'users-three', ref: 'users-three', cat: 'social' },
	{ slug: 'baby', ref: 'baby', cat: 'social' },

	// Currency / commerce
	{ slug: 'coin', ref: 'coin', cat: 'commerce' },
	{ slug: 'coins', ref: 'coins', cat: 'commerce' },
	{ slug: 'wallet', ref: 'wallet', cat: 'commerce' },
	{ slug: 'piggy-bank', ref: 'piggy-bank', cat: 'commerce' },
	{ slug: 'shopping-cart', ref: 'shopping-cart', cat: 'commerce' },
	{ slug: 'gift', ref: 'gift', cat: 'commerce' },

	// Tools / dev
	{ slug: 'wrench', ref: 'wrench', cat: 'tech' },
	{ slug: 'hammer', ref: 'hammer', cat: 'tech' },
	{ slug: 'gear', ref: 'gear', cat: 'tech' },
	{ slug: 'gear-six', ref: 'gear-six', cat: 'tech' },
	{ slug: 'code', ref: 'code', cat: 'tech' },
	{ slug: 'terminal', ref: 'terminal', cat: 'tech' },
	{ slug: 'terminal-window', ref: 'terminal-window', cat: 'tech' },
	{ slug: 'cpu', ref: 'cpu', cat: 'tech' },
	{ slug: 'database', ref: 'database', cat: 'tech' },
	{ slug: 'cloud', ref: 'cloud', cat: 'tech' },

	// UI / nav
	{ slug: 'house', ref: 'house', cat: 'navigation' },
	{ slug: 'house-simple', ref: 'house-simple', cat: 'navigation' },
	{ slug: 'compass', ref: 'compass', cat: 'navigation' },
	{ slug: 'map-pin', ref: 'map-pin', cat: 'navigation' },
	{ slug: 'magnifying-glass', ref: 'magnifying-glass', cat: 'action' },
	{ slug: 'bell', ref: 'bell-phosphor', cat: 'comms' },
	{ slug: 'envelope', ref: 'envelope', cat: 'comms' },
	{ slug: 'chat-circle', ref: 'chat-circle', cat: 'comms' },

	// Media
	{ slug: 'play', ref: 'play', cat: 'media' },
	{ slug: 'pause', ref: 'pause', cat: 'media' },
	{ slug: 'stop', ref: 'stop', cat: 'media' },
	{ slug: 'speaker-high', ref: 'speaker-high', cat: 'media' },
	{ slug: 'speaker-low', ref: 'speaker-low', cat: 'media' },
	{ slug: 'speaker-x', ref: 'speaker-x', cat: 'media' },
	{ slug: 'microphone', ref: 'microphone', cat: 'media' },
	{ slug: 'video-camera', ref: 'video-camera', cat: 'media' },
	{ slug: 'image', ref: 'image-phosphor', cat: 'media' },

	// Status / feedback
	{ slug: 'check-circle', ref: 'check-circle', cat: 'action' },
	{ slug: 'x-circle', ref: 'x-circle', cat: 'action' },
	{ slug: 'warning', ref: 'warning', cat: 'action' },
	{ slug: 'warning-octagon', ref: 'warning-octagon', cat: 'action' },
	{ slug: 'info', ref: 'info', cat: 'action' },
	{ slug: 'question', ref: 'question', cat: 'action' },
	{ slug: 'lock', ref: 'lock', cat: 'action' },
	{ slug: 'lock-open', ref: 'lock-open', cat: 'action' },

	// Weather
	{ slug: 'sun', ref: 'sun', cat: 'weather' },
	{ slug: 'moon', ref: 'moon', cat: 'weather' },
	{ slug: 'cloud-rain', ref: 'cloud-rain', cat: 'weather' },
	{ slug: 'snowflake', ref: 'snowflake', cat: 'weather' },
	{ slug: 'thermometer', ref: 'thermometer', cat: 'weather' },

	// Animals (Phosphor has a fun animal subset)
	{ slug: 'cat', ref: 'cat', cat: 'social' },
	{ slug: 'dog', ref: 'dog', cat: 'social' },
	{ slug: 'rabbit', ref: 'rabbit', cat: 'social' },
	{ slug: 'fish', ref: 'fish-phosphor', cat: 'social' },
	{ slug: 'bird', ref: 'bird', cat: 'social' },

	// Misc
	{ slug: 'rocket', ref: 'rocket-phosphor', cat: 'tech' },
	{ slug: 'rocket-launch', ref: 'rocket-launch', cat: 'tech' },
	{ slug: 'planet', ref: 'planet', cat: 'tech' },
	{ slug: 'globe-hemisphere-east', ref: 'globe-hemisphere-east', cat: 'tech' },
	{ slug: 'sparkle', ref: 'sparkle', cat: 'game' },
	{ slug: 'star', ref: 'star-phosphor', cat: 'game' },
	{ slug: 'heart', ref: 'heart-phosphor', cat: 'social' },

	// Apparel / character dressing
	{ slug: 'baseball-cap', ref: 'baseball-cap', cat: 'social' },
	{ slug: 'hoodie', ref: 'hoodie', cat: 'social' },
	{ slug: 't-shirt', ref: 't-shirt', cat: 'social' },
	{ slug: 'sneaker', ref: 'sneaker', cat: 'social' },
	{ slug: 'eyeglasses', ref: 'eyeglasses', cat: 'social' },

	// Transit / travel
	{ slug: 'airplane', ref: 'airplane', cat: 'navigation' },
	{ slug: 'airplane-tilt', ref: 'airplane-tilt', cat: 'navigation' },
	{ slug: 'bicycle', ref: 'bicycle', cat: 'navigation' },
	{ slug: 'motorcycle', ref: 'motorcycle', cat: 'navigation' },
	{ slug: 'bus', ref: 'bus', cat: 'navigation' },
	{ slug: 'taxi', ref: 'taxi', cat: 'navigation' },
	{ slug: 'sailboat', ref: 'sailboat', cat: 'navigation' },

	// Food / drink
	{ slug: 'pizza', ref: 'pizza-phosphor', cat: 'commerce' },
	{ slug: 'hamburger', ref: 'hamburger-phosphor', cat: 'commerce' },
	{ slug: 'ice-cream', ref: 'ice-cream-phosphor', cat: 'commerce' },
	{ slug: 'beer-stein', ref: 'beer-stein', cat: 'commerce' },
	{ slug: 'coffee', ref: 'coffee-phosphor', cat: 'commerce' },
	{ slug: 'cake', ref: 'cake-phosphor', cat: 'commerce' },

	// Mood / emoji
	{ slug: 'smiley', ref: 'smiley', cat: 'social' },
	{ slug: 'smiley-sad', ref: 'smiley-sad', cat: 'social' },
	{ slug: 'smiley-angry', ref: 'smiley-angry', cat: 'social' },
	{ slug: 'smiley-meh', ref: 'smiley-meh', cat: 'social' },
	{ slug: 'smiley-x-eyes', ref: 'smiley-x-eyes', cat: 'social' },
	{ slug: 'smiley-melting', ref: 'smiley-melting', cat: 'social' },

	// Robot / AI / future
	{ slug: 'robot', ref: 'robot-phosphor', cat: 'tech' },
	{ slug: 'brain', ref: 'brain-phosphor', cat: 'tech' },
	{ slug: 'circuitry', ref: 'circuitry', cat: 'tech' },
	{ slug: 'brackets-curly', ref: 'brackets-curly', cat: 'tech' },
	{ slug: 'function', ref: 'function-phosphor', cat: 'tech' },
	{ slug: 'binary', ref: 'binary', cat: 'tech' },

	// Eco / nature
	{ slug: 'tree', ref: 'tree-phosphor', cat: 'weather' },
	{ slug: 'plant', ref: 'plant', cat: 'weather' },
	{ slug: 'leaf', ref: 'leaf-phosphor', cat: 'weather' },
	{ slug: 'flower', ref: 'flower-phosphor', cat: 'weather' },
	{ slug: 'recycle', ref: 'recycle-phosphor', cat: 'weather' },
	{ slug: 'wind', ref: 'wind-phosphor', cat: 'weather' },

	// Building / dressing
	{ slug: 'castle-turret', ref: 'castle-turret', cat: 'game' },
	{ slug: 'tent', ref: 'tent-phosphor', cat: 'game' },
	{ slug: 'campfire', ref: 'campfire-phosphor', cat: 'game' },
	{ slug: 'tree-evergreen', ref: 'tree-evergreen', cat: 'weather' },

	// Music instruments
	{ slug: 'guitar', ref: 'guitar', cat: 'media' },
	{ slug: 'piano-keys', ref: 'piano-keys', cat: 'media' },
	{ slug: 'drum', ref: 'drum-phosphor', cat: 'media' },
	{ slug: 'metronome', ref: 'metronome', cat: 'media' },
	{ slug: 'headphones', ref: 'headphones-phosphor', cat: 'media' },

	// Charts / analytics
	{ slug: 'chart-bar', ref: 'chart-bar-phosphor', cat: 'tech' },
	{ slug: 'chart-line', ref: 'chart-line', cat: 'tech' },
	{ slug: 'chart-pie', ref: 'chart-pie', cat: 'tech' },
	{ slug: 'chart-donut', ref: 'chart-donut', cat: 'tech' },
	{ slug: 'trend-up', ref: 'trend-up', cat: 'tech' },
	{ slug: 'trend-down', ref: 'trend-down', cat: 'tech' },

	// Medical / science
	{ slug: 'stethoscope', ref: 'stethoscope-phosphor', cat: 'tech' },
	{ slug: 'first-aid', ref: 'first-aid', cat: 'tech' },
	{ slug: 'pill', ref: 'pill-phosphor', cat: 'tech' },
	{ slug: 'syringe', ref: 'syringe', cat: 'tech' },
	{ slug: 'flask', ref: 'flask-phosphor', cat: 'tech' },
	{ slug: 'atom', ref: 'atom-phosphor', cat: 'tech' },

	// Animals expanded
	{ slug: 'butterfly', ref: 'butterfly', cat: 'social' },
	{ slug: 'dog', ref: 'dog-phosphor', cat: 'social' },
	{ slug: 'horse', ref: 'horse-phosphor', cat: 'social' },
	{ slug: 'shrimp', ref: 'shrimp', cat: 'social' },
	{ slug: 'snail', ref: 'snail-phosphor', cat: 'social' },

	// Tech infra
	{ slug: 'graph', ref: 'graph', cat: 'tech' },
	{ slug: 'tree-structure', ref: 'tree-structure', cat: 'tech' },
	{ slug: 'kanban', ref: 'kanban', cat: 'tech' },
	{ slug: 'git-branch', ref: 'git-branch-phosphor', cat: 'tech' },
	{ slug: 'git-commit', ref: 'git-commit-phosphor', cat: 'tech' },

	// Travel / transit extra
	{ slug: 'tram', ref: 'tram', cat: 'navigation' },
	{ slug: 'jeep', ref: 'jeep', cat: 'navigation' },
	{ slug: 'truck', ref: 'truck-phosphor', cat: 'navigation' },
];

function titleCase(str) {
	return str
		.split('-')
		.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ');
}

/**
 * Read the inner SVG markup for one Phosphor weight. Phosphor ships
 * `<svg viewBox="0 0 256 256" fill="currentColor">` per weight; strip the
 * outer `<svg>` and re-emit a viewBox-256 SVG so the catalog renders the
 * weight at any pixel size via CSS.
 */
function loadPhosphorVariant(slug, weight) {
	const file = path.join(PHOSPHOR_DIR, weight, `${slug}.svg`);
	if (!fs.existsSync(file)) return null;
	const raw = fs.readFileSync(file, 'utf8');
	const m = raw.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
	if (!m) return null;
	// Collapse internal whitespace so `svg_body: |` stays single-line —
	// duotone weight ships multi-element markup that would otherwise
	// break YAML block scalar indentation.
	const inner = m[1].replace(/\s+/g, ' ').trim();
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"` +
		` fill="currentColor">${inner}</svg>`
	);
}

function variantYaml(weight, svg) {
	const label = weight === 'fill' ? 'Filled' : titleCase(weight);
	const style =
		weight === 'fill'
			? 'filled'
			: weight === 'duotone'
				? 'duotone'
				: 'outline';
	return `  - ref: ${JSON.stringify(weight)}
    label: ${JSON.stringify(label)}
    style: ${style}
    format: svg
    viewbox: { min_x: 0, min_y: 0, width: 256, height: 256 }
    render:
      uses_current_color: true
      monochrome: ${weight === 'duotone' ? 'false' : 'true'}
    recommended_sizes: [16, 20, 24, 32]
    tags: [phosphor, ${weight}]
    svg_body: |
      ${svg}
`;
}

function mdxForTerm({ slug, ref, cat }, variants) {
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
	const variantBlocks = variants
		.map(({ weight, svg }) => variantYaml(weight, svg))
		.join('');

	return `---
ref: ${ref}
name: ${name}
title: ${name} Icon
description: ${name} glyph from the Phosphor Icons library (MIT), ${variants.length} weight${variants.length === 1 ? '' : 's'} — recolor via currentColor.
primary_category: ${cat}
categories: [${cat}, library]
tags: [phosphor-generated, multi-weight]
search:
  keywords: [${keywords}]
  primary_category: ${cat}
default_license:
  license: mit
  attribution_required: false
  attribution_line: "Phosphor Icons (https://phosphoricons.com/) — MIT License"
  author: Phosphor contributors
  source_url: "https://phosphoricons.com/?q=${slug}"
  commercial_use: true
  modifications_allowed: true
default_offering:
  offering: free
icons:
${variantBlocks}pagefindFilters: [phosphor, ${cat}]
---

import IconTermPanel from '@/components/icons/IconTermPanel.astro';

${name} — ${variants.length} weight${variants.length === 1 ? '' : 's'} from the [Phosphor Icons library](https://phosphoricons.com/) (MIT).

<IconTermPanel
	termRef={frontmatter.ref}
	name={frontmatter.name}
	description={frontmatter.description}
	primary_category={frontmatter.primary_category}
	categories={frontmatter.categories}
	tags={frontmatter.tags}
	default_license={frontmatter.default_license}
	keywords={frontmatter.search?.keywords}
	pagefindFilters={frontmatter.pagefindFilters}
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
		if (/^tags: \[phosphor-generated/m.test(head)) {
			if (!dryRun) fs.unlinkSync(p);
			removed++;
		}
	}
	return removed;
}

async function main() {
	if (!fs.existsSync(PHOSPHOR_DIR)) {
		console.error(
			`phosphor assets dir not found: ${PHOSPHOR_DIR}\nRun \`pnpm install\` first.`,
		);
		process.exit(1);
	}
	if (!noClean) {
		const removed = cleanPreviouslyGenerated();
		console.log(
			`cleaned ${removed} previously-generated phosphor MDX files`,
		);
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
	let missingWeights = 0;

	for (const entry of CURATED) {
		const variants = [];
		for (const weight of WEIGHTS) {
			const svg = loadPhosphorVariant(entry.slug, weight);
			if (svg) variants.push({ weight, svg });
			else missingWeights++;
		}
		if (variants.length === 0) {
			console.warn(`  ! no weights found for slug: ${entry.slug}`);
			missingSource++;
			continue;
		}

		let finalRef = entry.ref;
		if (handCrafted.has(finalRef)) {
			finalRef = `${entry.ref}-phosphor`;
			if (handCrafted.has(finalRef)) continue;
			collisionsRenamed++;
		}
		const mdx = mdxForTerm({ ...entry, ref: finalRef }, variants);
		if (!dryRun) {
			fs.writeFileSync(path.join(ICONS_DIR, `${finalRef}.mdx`), mdx);
		}
		written++;
	}

	console.log(
		`wrote ${written} terms (${collisionsRenamed} collision-renamed, ${missingWeights} missing-weight slots), ${missingSource} terms with no source${dryRun ? ' (dry-run)' : ''}`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
