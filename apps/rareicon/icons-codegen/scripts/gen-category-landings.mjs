#!/usr/bin/env node
/**
 * Generate one MDX landing page per `primary_category` value found in
 * the catalog. Each landing renders `<CategoryLanding />` pre-filtered
 * to that category — adds 14 high-traffic SEO entry points without
 * touching the existing 1270 direct term pages.
 *
 * Output: apps/rareicon/astro-rareicon/src/content/docs/icons/category/<slug>.mdx
 *
 * Cleanup pass walks the output dir and removes any stale category
 * file before regen so adding / dropping a category from the catalog
 * stays a one-command refresh.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const ICONS_DIR = path.resolve(
	WORKSPACE_ROOT,
	'apps/rareicon/astro-rareicon/src/content/docs/icons',
);
const CAT_DIR = path.resolve(ICONS_DIR, 'category');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

/**
 * Curated headline + lede copy per known category. Categories not in
 * this map fall back to title-case headline + a generic lede.
 */
const COPY = {
	ui: {
		headline: 'UI & general icons',
		lede: 'Buttons, toggles, layout chrome, status indicators. The Lucide-driven baseline that most product surfaces rely on.',
	},
	tech: {
		headline: 'Tech & infrastructure',
		lede: 'Languages, frameworks, runtimes, databases, devops, AI/ML brands. Multi-source-merged variants from Lucide outline through Devicon brand glyphs and SVG Logos full-color.',
	},
	game: {
		headline: 'Gamedev & roguelike',
		lede: 'Weapons, classes, monsters, magic, dungeon dressing. Curated from Game Icons (CC BY 3.0) plus Lucide / Phosphor / Tabler complements.',
	},
	gaming: {
		headline: 'Gaming platforms',
		lede: 'Steam, itch, GOG, Epic, PlayStation, Nintendo Switch, Game Jolt, Roblox. Plus engine icons — Unity, Unreal, Godot, Bevy, GameMaker, Construct 3.',
	},
	social: {
		headline: 'Social & community',
		lede: 'User / group / mood / character glyphs across multiple icon packs. Layered styles for product profile UI.',
	},
	commerce: {
		headline: 'Commerce & money',
		lede: 'Cart, wallet, payments, currencies, gifts, subscriptions. Brand glyphs (Patreon, Ko-fi, GitHub Sponsors, etc.) under Tier 1 attribution.',
	},
	navigation: {
		headline: 'Navigation & wayfinding',
		lede: 'Home, compass, map, breadcrumb, transit, travel — orient and route the user.',
	},
	media: {
		headline: 'Media & playback',
		lede: 'Play, pause, audio, video, image, microphone. Playback controls + brand glyphs for streaming platforms.',
	},
	action: {
		headline: 'Actions & affordances',
		lede: 'Plus, minus, check, close, edit, trash, save, share. The verb-shaped half of the catalog.',
	},
	weather: {
		headline: 'Weather & nature',
		lede: 'Sun, moon, cloud, rain, snow, wind, leaf, tree, recycle. Eco + climate icons.',
	},
	comms: {
		headline: 'Communication',
		lede: 'Mail, chat, bell, phone, megaphone — every way users notify and respond.',
	},
	file: {
		headline: 'Files & storage',
		lede: 'File / folder / archive / clipboard / book glyphs.',
	},
	weapon: {
		headline: 'Weapons',
		lede: 'Hand-curated weapon glyphs. Most gamedev weapons live under the Gamedev category — this one is for catalog terms specifically tagged primary_category=weapon.',
	},
	'sci-fi': {
		headline: 'Sci-fi',
		lede: 'Niche sci-fi-specific glyphs.',
	},
};

function titleCase(str) {
	return str
		.split('-')
		.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ');
}

function discoverCategories() {
	const cats = new Set();
	const re = /^primary_category:\s*(\S+)/m;
	for (const f of fs.readdirSync(ICONS_DIR)) {
		if (!f.endsWith('.mdx') || f === 'index.mdx') continue;
		const fp = path.join(ICONS_DIR, f);
		if (fs.statSync(fp).isDirectory()) continue;
		const head = fs.readFileSync(fp, 'utf8').slice(0, 800);
		const m = head.match(re);
		if (m) cats.add(m[1].trim());
	}
	return Array.from(cats).sort();
}

function emitMdx(cat) {
	const meta = COPY[cat] ?? {
		headline: titleCase(cat),
		lede: `Catalog terms tagged primary_category=${cat}.`,
	};
	const headline = meta.headline.replace(/"/g, '\\"');
	const ledeJs = JSON.stringify(meta.lede);
	return `---
title: ${headline}
description: ${meta.lede.split('.')[0]}.
sidebar:
  label: ${headline}
editUrl: false
lastUpdated: false
prev: false
next: false
---

import CategoryLanding from '@/components/icons/CategoryLanding.astro';

<CategoryLanding
  category=${JSON.stringify(cat)}
  headline=${JSON.stringify(meta.headline)}
  lede=${ledeJs}
/>
`;
}

function cleanCategoryDir() {
	if (!fs.existsSync(CAT_DIR)) return 0;
	let removed = 0;
	for (const f of fs.readdirSync(CAT_DIR)) {
		if (!f.endsWith('.mdx')) continue;
		if (!dryRun) fs.unlinkSync(path.join(CAT_DIR, f));
		removed++;
	}
	return removed;
}

function main() {
	if (!fs.existsSync(ICONS_DIR)) {
		console.error(`icons dir missing: ${ICONS_DIR}`);
		process.exit(1);
	}

	const cats = discoverCategories();
	console.log(`discovered ${cats.length} categories: ${cats.join(', ')}`);

	if (!fs.existsSync(CAT_DIR)) {
		if (!dryRun) fs.mkdirSync(CAT_DIR, { recursive: true });
	} else {
		const removed = cleanCategoryDir();
		console.log(`cleaned ${removed} previous category landings`);
	}

	let written = 0;
	for (const cat of cats) {
		const file = path.join(CAT_DIR, `${cat}.mdx`);
		const mdx = emitMdx(cat);
		if (!dryRun) fs.writeFileSync(file, mdx);
		written++;
	}

	console.log(`wrote ${written} category landing pages${dryRun ? ' (dry-run)' : ''}`);
}

main();
