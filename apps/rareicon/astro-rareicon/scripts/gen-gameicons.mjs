#!/usr/bin/env node
/**
 * Generate IconTerm MDX files from `@iconify-json/game-icons`
 * (CC BY 3.0 — game-icons.net).
 *
 * Game Icons is the most thematically-relevant pack for RareIcon —
 * weapons, monsters, magic, dungeons, classes, status effects. The
 * Iconify bundle ships ~4100 icons as a single JSON map of body markup
 * keyed by slug. Each glyph is a single-path `<path fill="currentColor">`
 * inside a 512×512 viewBox.
 *
 * Curated whitelist below picks the ~80 highest-value gamedev terms.
 * Catalog can grow this list incrementally without touching the
 * codegen plumbing.
 *
 * License: CC BY 3.0 — `attribution_required: true` on every entry.
 * The Iconify bundle attributes to "GameIcons" collectively; per-icon
 * artist credit lives at game-icons.net (not in the JSON).
 *
 * Hand-crafted lock: existing `<ref>.mdx` writes to `<ref>-game.mdx`.
 *
 * Generated marker: `tags: [game-icons-generated, ...]`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const ICONS_DIR = path.resolve(__dirname, '../src/content/docs/icons');
const GAME_ICONS_JSON = path.resolve(
	WORKSPACE_ROOT,
	'node_modules/@iconify-json/game-icons/icons.json',
);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noClean = args.includes('--no-clean');

/**
 * Curated whitelist. Each `slug` matches an Iconify game-icons key;
 * `ref` is the catalog term ref. Categories use the catalog's
 * existing 'game' bucket plus 'social' for character / class icons.
 *
 * Pick principle: terms RareIcon's bullet-hell roguelite would actually
 * surface — weapons, classes, status effects, dungeon dressing.
 * Avoid niche / one-off illustrations.
 */
const CURATED = [
	// Bladed weapons
	{ slug: 'broadsword', ref: 'broadsword', cat: 'game' },
	{ slug: 'katana', ref: 'katana', cat: 'game' },
	{ slug: 'machete', ref: 'machete', cat: 'game' },
	{ slug: 'scythe', ref: 'scythe', cat: 'game' },
	{ slug: 'crossed-swords', ref: 'crossed-swords', cat: 'game' },
	{ slug: 'pointy-sword', ref: 'pointy-sword', cat: 'game' },
	{ slug: 'wooden-sign', ref: 'wooden-sign', cat: 'game' },

	// Ranged
	{ slug: 'crossbow', ref: 'crossbow', cat: 'game' },
	{ slug: 'high-shot', ref: 'high-shot', cat: 'game' },
	{ slug: 'bullets', ref: 'bullets', cat: 'game' },
	{ slug: 'arrow-cluster', ref: 'arrow-cluster', cat: 'game' },
	{ slug: 'crossed-pistols', ref: 'crossed-pistols', cat: 'game' },
	{ slug: 'pistol-gun', ref: 'pistol-gun', cat: 'game' },
	{ slug: 'desert-eagle', ref: 'desert-eagle', cat: 'game' },
	{ slug: 'machine-gun', ref: 'machine-gun', cat: 'game' },
	{ slug: 'rocket', ref: 'rocket-launcher', cat: 'game' },

	// Magic / spells
	{ slug: 'fireball', ref: 'fireball', cat: 'game' },
	{ slug: 'magic-swirl', ref: 'magic-swirl', cat: 'game' },
	{ slug: 'lightning-storm', ref: 'lightning-storm', cat: 'game' },
	{ slug: 'frostfire', ref: 'frostfire', cat: 'game' },
	{ slug: 'ice-spell-cast', ref: 'ice-spell-cast', cat: 'game' },
	{ slug: 'crystal-ball', ref: 'crystal-ball', cat: 'game' },
	{ slug: 'magic-lamp', ref: 'magic-lamp', cat: 'game' },
	{ slug: 'spell-book', ref: 'spell-book', cat: 'game' },
	{ slug: 'magic-portal', ref: 'magic-portal', cat: 'game' },

	// Armor / defense
	{ slug: 'cracked-shield', ref: 'cracked-shield', cat: 'game' },
	{ slug: 'shield-bounces', ref: 'shield-bounces', cat: 'game' },
	{ slug: 'magic-shield', ref: 'magic-shield', cat: 'game' },
	{ slug: 'breastplate', ref: 'breastplate', cat: 'game' },
	{ slug: 'visored-helm', ref: 'visored-helm', cat: 'game' },
	{ slug: 'royal-love', ref: 'royal-love', cat: 'game' },

	// Status / effects
	{ slug: 'health-normal', ref: 'health-normal', cat: 'game' },
	{ slug: 'health-decrease', ref: 'health-decrease', cat: 'game' },
	{ slug: 'health-increase', ref: 'health-increase', cat: 'game' },
	{ slug: 'mana-burn', ref: 'mana-burn', cat: 'game' },
	{ slug: 'shield-impact', ref: 'shield-impact', cat: 'game' },
	{ slug: 'poison-bottle', ref: 'poison-bottle', cat: 'game' },
	{ slug: 'flaming-claw', ref: 'flaming-claw', cat: 'game' },
	{ slug: 'frozen-orb', ref: 'frozen-orb', cat: 'game' },
	{ slug: 'electric', ref: 'electric-shock', cat: 'game' },

	// Classes / archetypes
	{ slug: 'warrior', ref: 'warrior', cat: 'game' },
	{ slug: 'archer', ref: 'archer', cat: 'game' },
	{ slug: 'wizard-face', ref: 'wizard-face', cat: 'game' },
	{ slug: 'ninja-mask', ref: 'ninja-mask', cat: 'game' },
	{ slug: 'rogue', ref: 'rogue', cat: 'game' },
	{ slug: 'paladin', ref: 'paladin', cat: 'game' },
	{ slug: 'cleric', ref: 'cleric', cat: 'game' },

	// Monsters / enemies
	{ slug: 'dragon-head', ref: 'dragon-head', cat: 'game' },
	{ slug: 'goblin-head', ref: 'goblin-head', cat: 'game' },
	{ slug: 'orc-head', ref: 'orc-head', cat: 'game' },
	{ slug: 'demon-skull', ref: 'demon-skull', cat: 'game' },
	{ slug: 'cyclops', ref: 'cyclops', cat: 'game' },
	{ slug: 'spider-face', ref: 'spider-face', cat: 'game' },
	{ slug: 'slime', ref: 'slime', cat: 'game' },
	{ slug: 'witch-face', ref: 'witch-face', cat: 'game' },

	// Loot / economy
	{ slug: 'treasure-map', ref: 'treasure-map', cat: 'game' },
	{ slug: 'open-treasure-chest', ref: 'open-treasure-chest', cat: 'game' },
	{ slug: 'closed-treasure-chest', ref: 'closed-treasure-chest', cat: 'game' },
	{ slug: 'gold-bar', ref: 'gold-bar', cat: 'commerce' },
	{ slug: 'two-coins', ref: 'two-coins', cat: 'commerce' },
	{ slug: 'cut-diamond', ref: 'cut-diamond', cat: 'commerce' },

	// World / environment
	{ slug: 'castle-emblem', ref: 'castle-emblem', cat: 'game' },
	{ slug: 'tower', ref: 'game-tower', cat: 'game' },
	{ slug: 'dungeon-gate', ref: 'dungeon-gate', cat: 'game' },
	{ slug: 'forest-camp', ref: 'forest-camp', cat: 'game' },
	{ slug: 'tombstone', ref: 'tombstone', cat: 'game' },
	{ slug: 'oak-leaf', ref: 'oak-leaf', cat: 'game' },

	// Misc gamedev
	{ slug: 'dice-six-faces-five', ref: 'dice-five', cat: 'game' },
	{ slug: 'rolling-dices', ref: 'rolling-dices', cat: 'game' },
	{ slug: 'level-up', ref: 'level-up', cat: 'game' },
	{ slug: 'experience', ref: 'experience', cat: 'game' },
	{ slug: 'power-lightning', ref: 'power-lightning', cat: 'game' },
	{ slug: 'invisible', ref: 'invisible', cat: 'game' },
];

function titleCase(str) {
	return str
		.split('-')
		.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ');
}

function loadGameIconsBundle() {
	if (!fs.existsSync(GAME_ICONS_JSON)) return null;
	const json = JSON.parse(fs.readFileSync(GAME_ICONS_JSON, 'utf8'));
	return json;
}

function buildSvg(body, width, height) {
	// Collapse internal whitespace so `svg_body: |` stays single-line.
	const inner = body.replace(/\s+/g, ' ').trim();
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"` +
		` fill="currentColor">${inner}</svg>`
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
description: ${name} glyph from the Game Icons library (CC BY 3.0), 1 variant — filled, recolor via currentColor.
primary_category: ${cat}
categories: [${cat}, library, gamedev]
tags: [game-icons-generated, gamedev, filled]
search:
  keywords: [${keywords}]
  primary_category: ${cat}
default_license:
  license: cc_by
  attribution_required: true
  attribution_line: "Game Icons (https://game-icons.net/) — CC BY 3.0 — credit listed per artist on source page"
  author: Game Icons contributors
  source_url: "https://game-icons.net/1x1/${slug}"
  commercial_use: true
  modifications_allowed: true
default_offering:
  offering: free
icons:
  - ref: "filled"
    label: "Filled"
    style: filled
    format: svg
    viewbox: { min_x: 0, min_y: 0, width: 512, height: 512 }
    render:
      uses_current_color: true
      monochrome: true
    recommended_sizes: [24, 32, 48, 64]
    tags: [game-icons, gamedev]
    svg_body: |
      ${svgBody}
pagefindFilters: [game-icons, gamedev, ${cat}]
---

import IconTermPanel from '@/components/icons/IconTermPanel.astro';

${name} — gamedev glyph from the [Game Icons library](https://game-icons.net/) (CC BY 3.0). Attribution required: see the source page for the per-artist credit.

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

function cleanPreviouslyGenerated() {
	if (!fs.existsSync(ICONS_DIR)) return 0;
	let removed = 0;
	for (const f of fs.readdirSync(ICONS_DIR)) {
		if (!f.endsWith('.mdx') || f === 'index.mdx') continue;
		const p = path.join(ICONS_DIR, f);
		const head = fs.readFileSync(p, 'utf8').slice(0, 800);
		if (/^tags: \[game-icons-generated/m.test(head)) {
			if (!dryRun) fs.unlinkSync(p);
			removed++;
		}
	}
	return removed;
}

async function main() {
	const bundle = loadGameIconsBundle();
	if (!bundle) {
		console.error(
			`game-icons bundle not found: ${GAME_ICONS_JSON}\nRun \`pnpm install\` first.`,
		);
		process.exit(1);
	}

	if (!noClean) {
		const removed = cleanPreviouslyGenerated();
		console.log(
			`cleaned ${removed} previously-generated game-icons MDX files`,
		);
	}

	const handCrafted = new Set(
		fs
			.readdirSync(ICONS_DIR)
			.filter((f) => f.endsWith('.mdx') && f !== 'index.mdx')
			.map((f) => f.replace(/\.mdx$/, '')),
	);

	const width = bundle.width ?? 512;
	const height = bundle.height ?? 512;

	let written = 0;
	let collisionsRenamed = 0;
	let missingSource = 0;

	for (const entry of CURATED) {
		const icon = bundle.icons[entry.slug];
		if (!icon || !icon.body) {
			console.warn(`  ! source missing in bundle: ${entry.slug}`);
			missingSource++;
			continue;
		}
		const svg = buildSvg(icon.body, icon.width ?? width, icon.height ?? height);

		let finalRef = entry.ref;
		if (handCrafted.has(finalRef)) {
			finalRef = `${entry.ref}-game`;
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
		`wrote ${written} game-icons terms (${collisionsRenamed} collision-renamed), ${missingSource} missing source${dryRun ? ' (dry-run)' : ''}`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
