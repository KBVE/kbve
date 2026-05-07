#!/usr/bin/env node
/**
 * Generic codegen for `@iconify-json/*` bundles.
 *
 * Iconify ships every icon set as a single JSON map of slug → body
 * markup. This script takes one pack config per entry, picks a curated
 * whitelist of slugs, and emits one IconTerm MDX per slug. The merger
 * (gen-merge-variants.mjs) folds the suffix files into base terms so a
 * concept like `home` shows Lucide outline + Heroicon outline + Iconoir
 * + Carbon side by side.
 *
 * Adding a pack: drop a new entry into PACKS with bundle path, license
 * info, generated tag, suffix, and curated whitelist. Re-run via
 *   node scripts/gen-iconify-icons.mjs
 * The merger then consolidates anything the curated list collides with.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const ICONS_DIR = path.resolve(__dirname, '../src/content/docs/icons');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noClean = args.includes('--no-clean');
const onlyArg = args.indexOf('--only');
const onlyPack = onlyArg >= 0 ? args[onlyArg + 1] : null;

/**
 * Pack registry. Each entry drives one full codegen pass.
 *
 *   prefix: human / log label
 *   bundle: path to the Iconify JSON bundle (relative to workspace root)
 *   suffix: ref suffix on collision; the merger groups by this
 *   genTag:  unique `tags[0]` marker so cleanup pass round-trips per-pack
 *   license: schema enum value (cc0 | cc_by | mit | apache_2 | isc | ...)
 *   licenseLine / sourceUrlPrefix / pagefindFilter: rendered into mdx
 *   homeUrl: project homepage
 *   curated: array of { slug, ref, cat }
 */
const PACKS = [
	{
		prefix: 'heroicons',
		bundle: 'node_modules/@iconify-json/heroicons/icons.json',
		suffix: 'hero',
		genTag: 'heroicons-generated',
		license: 'mit',
		licenseLine: 'Heroicons (https://heroicons.com/) — MIT License',
		author: 'Refactoring UI Inc.',
		homeUrl: 'https://heroicons.com/',
		sourceUrlPrefix: 'https://heroicons.com/',
		pagefindFilter: 'heroicons',
		curated: [
			{ slug: 'home', ref: 'home', cat: 'navigation' },
			{ slug: 'home-modern', ref: 'home-modern', cat: 'navigation' },
			{ slug: 'building-storefront', ref: 'building-storefront', cat: 'commerce' },
			{ slug: 'shopping-cart', ref: 'shopping-cart', cat: 'commerce' },
			{ slug: 'shopping-bag', ref: 'shopping-bag', cat: 'commerce' },
			{ slug: 'banknotes', ref: 'banknotes', cat: 'commerce' },
			{ slug: 'credit-card', ref: 'credit-card', cat: 'commerce' },
			{ slug: 'cube', ref: 'cube', cat: 'tech' },
			{ slug: 'cube-transparent', ref: 'cube-transparent', cat: 'tech' },
			{ slug: 'beaker', ref: 'beaker', cat: 'tech' },
			{ slug: 'rocket-launch', ref: 'rocket-launch-hero', cat: 'tech' },
			{ slug: 'sparkles', ref: 'sparkles', cat: 'game' },
			{ slug: 'fire', ref: 'fire', cat: 'game' },
			{ slug: 'bolt', ref: 'bolt', cat: 'game' },
			{ slug: 'shield-check', ref: 'shield-check', cat: 'game' },
			{ slug: 'shield-exclamation', ref: 'shield-exclamation', cat: 'game' },
			{ slug: 'trophy', ref: 'trophy', cat: 'game' },
			{ slug: 'gift', ref: 'gift', cat: 'commerce' },
			{ slug: 'heart', ref: 'heart', cat: 'social' },
			{ slug: 'star', ref: 'star', cat: 'social' },
			{ slug: 'user-circle', ref: 'user-circle', cat: 'social' },
			{ slug: 'user-group', ref: 'user-group', cat: 'social' },
			{ slug: 'users', ref: 'users', cat: 'social' },
			{ slug: 'lock-closed', ref: 'lock-closed', cat: 'action' },
			{ slug: 'lock-open', ref: 'lock-open', cat: 'action' },
			{ slug: 'key', ref: 'key', cat: 'action' },
			{ slug: 'eye', ref: 'eye', cat: 'action' },
			{ slug: 'eye-slash', ref: 'eye-slash', cat: 'action' },
			{ slug: 'cloud', ref: 'cloud', cat: 'tech' },
			{ slug: 'cloud-arrow-up', ref: 'cloud-arrow-up', cat: 'tech' },
			{ slug: 'cloud-arrow-down', ref: 'cloud-arrow-down', cat: 'tech' },
			{ slug: 'server', ref: 'server', cat: 'tech' },
			{ slug: 'server-stack', ref: 'server-stack', cat: 'tech' },
			{ slug: 'cpu-chip', ref: 'cpu-chip', cat: 'tech' },
			{ slug: 'circle-stack', ref: 'circle-stack', cat: 'tech' },
			{ slug: 'wrench-screwdriver', ref: 'wrench-screwdriver', cat: 'tech' },
			{ slug: 'cog-6-tooth', ref: 'cog-6-tooth', cat: 'tech' },
			{ slug: 'command-line', ref: 'command-line', cat: 'tech' },
			{ slug: 'code-bracket', ref: 'code-bracket', cat: 'tech' },
			{ slug: 'envelope', ref: 'envelope', cat: 'comms' },
			{ slug: 'chat-bubble-left', ref: 'chat-bubble-left', cat: 'comms' },
			{ slug: 'megaphone', ref: 'megaphone', cat: 'comms' },
			{ slug: 'bell-alert', ref: 'bell-alert', cat: 'comms' },
			{ slug: 'magnifying-glass', ref: 'magnifying-glass', cat: 'action' },
			{ slug: 'adjustments-horizontal', ref: 'adjustments-horizontal', cat: 'action' },
			{ slug: 'arrow-trending-up', ref: 'arrow-trending-up', cat: 'tech' },
			{ slug: 'arrow-trending-down', ref: 'arrow-trending-down', cat: 'tech' },
			{ slug: 'chart-bar', ref: 'chart-bar', cat: 'tech' },
			{ slug: 'chart-pie', ref: 'chart-pie', cat: 'tech' },
			{ slug: 'presentation-chart-line', ref: 'presentation-chart-line', cat: 'tech' },
		],
	},
	{
		prefix: 'octicons',
		bundle: 'node_modules/@iconify-json/octicon/icons.json',
		suffix: 'octicon',
		genTag: 'octicons-generated',
		license: 'mit',
		licenseLine: 'Octicons (https://primer.style/foundations/icons) — MIT License',
		author: 'GitHub Inc.',
		homeUrl: 'https://primer.style/foundations/icons',
		sourceUrlPrefix: 'https://primer.style/foundations/icons/',
		pagefindFilter: 'octicons',
		curated: [
			{ slug: 'mark-github-24', ref: 'mark-github', cat: 'tech' },
			{ slug: 'logo-github-24', ref: 'logo-github', cat: 'tech' },
			{ slug: 'repo-24', ref: 'repo', cat: 'tech' },
			{ slug: 'repo-forked-24', ref: 'repo-forked', cat: 'tech' },
			{ slug: 'repo-clone-24', ref: 'repo-clone', cat: 'tech' },
			{ slug: 'git-branch-24', ref: 'git-branch', cat: 'tech' },
			{ slug: 'git-commit-24', ref: 'git-commit', cat: 'tech' },
			{ slug: 'git-merge-24', ref: 'git-merge', cat: 'tech' },
			{ slug: 'git-pull-request-24', ref: 'git-pull-request', cat: 'tech' },
			{ slug: 'git-compare-24', ref: 'git-compare', cat: 'tech' },
			{ slug: 'issue-opened-24', ref: 'issue-opened', cat: 'tech' },
			{ slug: 'issue-closed-24', ref: 'issue-closed', cat: 'tech' },
			{ slug: 'pull-request-24', ref: 'pull-request', cat: 'tech' },
			{ slug: 'workflow-24', ref: 'workflow', cat: 'tech' },
			{ slug: 'package-24', ref: 'package-octicon', cat: 'tech' },
			{ slug: 'codespaces-24', ref: 'codespaces', cat: 'tech' },
			{ slug: 'rocket-24', ref: 'rocket-octicon', cat: 'tech' },
			{ slug: 'shield-check-24', ref: 'shield-check-octicon', cat: 'tech' },
			{ slug: 'lock-24', ref: 'lock-octicon', cat: 'action' },
			{ slug: 'key-24', ref: 'key-octicon', cat: 'action' },
			{ slug: 'star-24', ref: 'star-octicon', cat: 'social' },
			{ slug: 'eye-24', ref: 'eye-octicon', cat: 'action' },
			{ slug: 'bug-24', ref: 'bug', cat: 'tech' },
			{ slug: 'terminal-24', ref: 'terminal-octicon', cat: 'tech' },
			{ slug: 'code-24', ref: 'code-octicon', cat: 'tech' },
			{ slug: 'file-code-24', ref: 'file-code', cat: 'tech' },
			{ slug: 'file-diff-24', ref: 'file-diff', cat: 'tech' },
		],
	},
	{
		prefix: 'iconoir',
		bundle: 'node_modules/@iconify-json/iconoir/icons.json',
		suffix: 'iconoir',
		genTag: 'iconoir-generated',
		license: 'mit',
		licenseLine: 'Iconoir (https://iconoir.com/) — MIT License',
		author: 'Iconoir contributors',
		homeUrl: 'https://iconoir.com/',
		sourceUrlPrefix: 'https://iconoir.com/',
		pagefindFilter: 'iconoir',
		curated: [
			{ slug: 'home-simple', ref: 'home-simple', cat: 'navigation' },
			{ slug: 'compass', ref: 'compass', cat: 'navigation' },
			{ slug: 'pin', ref: 'pin', cat: 'navigation' },
			{ slug: 'globe', ref: 'globe', cat: 'navigation' },
			{ slug: 'community', ref: 'community', cat: 'social' },
			{ slug: 'group', ref: 'group', cat: 'social' },
			{ slug: 'profile-circle', ref: 'profile-circle', cat: 'social' },
			{ slug: 'mail', ref: 'mail', cat: 'comms' },
			{ slug: 'send', ref: 'send', cat: 'comms' },
			{ slug: 'chat-lines', ref: 'chat-lines', cat: 'comms' },
			{ slug: 'megaphone', ref: 'megaphone-iconoir', cat: 'comms' },
			{ slug: 'attachment', ref: 'attachment', cat: 'action' },
			{ slug: 'edit', ref: 'edit', cat: 'action' },
			{ slug: 'trash', ref: 'trash', cat: 'action' },
			{ slug: 'add-circle', ref: 'add-circle', cat: 'action' },
			{ slug: 'minus-circle', ref: 'minus-circle', cat: 'action' },
			{ slug: 'check-circle', ref: 'check-circle-iconoir', cat: 'action' },
			{ slug: 'xmark-circle', ref: 'xmark-circle', cat: 'action' },
			{ slug: 'wrench', ref: 'wrench-iconoir', cat: 'tech' },
			{ slug: 'cpu', ref: 'cpu-iconoir', cat: 'tech' },
			{ slug: 'database', ref: 'database-iconoir', cat: 'tech' },
			{ slug: 'cloud', ref: 'cloud-iconoir', cat: 'tech' },
			{ slug: 'data-transfer-up', ref: 'data-transfer-up', cat: 'tech' },
			{ slug: 'shield', ref: 'shield-iconoir', cat: 'game' },
			{ slug: 'crown', ref: 'crown-iconoir', cat: 'game' },
			{ slug: 'flash', ref: 'flash', cat: 'game' },
			{ slug: 'spark', ref: 'spark', cat: 'game' },
		],
	},
	{
		prefix: 'carbon',
		bundle: 'node_modules/@iconify-json/carbon/icons.json',
		suffix: 'carbon',
		genTag: 'carbon-generated',
		license: 'apache_2',
		licenseLine: 'Carbon Icons (https://carbondesignsystem.com/guidelines/icons/library/) — Apache 2.0',
		author: 'IBM Corp.',
		homeUrl: 'https://carbondesignsystem.com/guidelines/icons/library/',
		sourceUrlPrefix: 'https://carbondesignsystem.com/guidelines/icons/library/?icon=',
		pagefindFilter: 'carbon',
		curated: [
			{ slug: 'cloud-services', ref: 'cloud-services', cat: 'tech' },
			{ slug: 'cloud-foundry-1', ref: 'cloud-foundry', cat: 'tech' },
			{ slug: 'kubernetes', ref: 'kubernetes-carbon', cat: 'tech' },
			{ slug: 'docker', ref: 'docker-carbon', cat: 'tech' },
			{ slug: 'container-software', ref: 'container-software', cat: 'tech' },
			{ slug: 'load-balancer-application', ref: 'load-balancer-application', cat: 'tech' },
			{ slug: 'load-balancer-network', ref: 'load-balancer-network', cat: 'tech' },
			{ slug: 'firewall', ref: 'firewall', cat: 'tech' },
			{ slug: 'gateway', ref: 'gateway', cat: 'tech' },
			{ slug: 'router', ref: 'router-carbon', cat: 'tech' },
			{ slug: 'server-proxy', ref: 'server-proxy', cat: 'tech' },
			{ slug: 'edge-node', ref: 'edge-node', cat: 'tech' },
			{ slug: 'data-center', ref: 'data-center', cat: 'tech' },
			{ slug: 'data-vis-1', ref: 'data-vis', cat: 'tech' },
			{ slug: 'machine-learning-model', ref: 'machine-learning-model', cat: 'tech' },
			{ slug: 'ai-status', ref: 'ai-status', cat: 'tech' },
			{ slug: 'watson', ref: 'watson', cat: 'tech' },
			{ slug: 'compute-classic', ref: 'compute-classic', cat: 'tech' },
			{ slug: 'compute-bare-metal-server', ref: 'compute-bare-metal', cat: 'tech' },
			{ slug: 'rocket', ref: 'rocket-carbon', cat: 'tech' },
			{ slug: 'analytics', ref: 'analytics', cat: 'tech' },
			{ slug: 'block-storage', ref: 'block-storage', cat: 'tech' },
			{ slug: 'object-storage', ref: 'object-storage', cat: 'tech' },
			{ slug: 'vmdk-disk', ref: 'vmdk-disk', cat: 'tech' },
			{ slug: 'rule', ref: 'rule', cat: 'tech' },
			{ slug: 'security', ref: 'security', cat: 'tech' },
			{ slug: 'shield', ref: 'shield-carbon', cat: 'tech' },
			{ slug: 'devices', ref: 'devices', cat: 'tech' },
			{ slug: 'assembly-cluster', ref: 'assembly-cluster', cat: 'tech' },
			{ slug: 'cics-system-group', ref: 'cics-system-group', cat: 'tech' },
		],
	},
];

function titleCase(str) {
	return str
		.split('-')
		.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ');
}

function loadBundle(relPath) {
	const file = path.resolve(WORKSPACE_ROOT, relPath);
	if (!fs.existsSync(file)) return null;
	return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function buildSvg(body, width, height) {
	const inner = body.replace(/\s+/g, ' ').trim();
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"` +
		` fill="currentColor">${inner}</svg>`
	);
}

function mdxForTerm(pack, entry, svgBody, width, height) {
	const name = titleCase(entry.ref);
	const keywords = JSON.stringify(
		Array.from(
			new Set([
				entry.ref,
				...entry.ref.split('-').filter((w) => w.length > 1),
				entry.slug,
				name.toLowerCase(),
			]),
		),
	).slice(1, -1);

	return `---
ref: ${entry.ref}
name: ${name}
title: ${name} Icon
description: ${name} glyph from the ${pack.prefix} icon library, 1 variant — recolor via currentColor.
primary_category: ${entry.cat}
categories: [${entry.cat}, library]
tags: [${pack.genTag}, ${pack.prefix}]
search:
  keywords: [${keywords}]
  primary_category: ${entry.cat}
default_license:
  license: ${pack.license}
  attribution_required: ${pack.license === 'cc_by' ? 'true' : 'false'}
  attribution_line: "${pack.licenseLine}"
  author: ${pack.author}
  source_url: "${pack.sourceUrlPrefix}${entry.slug}"
  commercial_use: true
  modifications_allowed: true
default_offering:
  offering: free
icons:
  - ref: ${JSON.stringify(pack.prefix)}
    label: ${JSON.stringify(titleCase(pack.prefix))}
    style: outline
    format: svg
    viewbox: { min_x: 0, min_y: 0, width: ${width}, height: ${height} }
    render:
      uses_current_color: true
      monochrome: true
    recommended_sizes: [16, 20, 24, 32]
    tags: [${pack.prefix}]
    svg_body: |
      ${svgBody}
pagefindFilters: [${pack.pagefindFilter}, ${entry.cat}]
---

import IconTermPanel from '@/components/icons/IconTermPanel.astro';

${name} — glyph from the [${titleCase(pack.prefix)} icon library](${pack.homeUrl}).

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

function cleanPreviouslyGenerated(genTag) {
	if (!fs.existsSync(ICONS_DIR)) return 0;
	let removed = 0;
	const re = new RegExp(`^tags: \\[${genTag}`, 'm');
	for (const f of fs.readdirSync(ICONS_DIR)) {
		if (!f.endsWith('.mdx') || f === 'index.mdx') continue;
		const p = path.join(ICONS_DIR, f);
		const head = fs.readFileSync(p, 'utf8').slice(0, 800);
		if (re.test(head)) {
			if (!dryRun) fs.unlinkSync(p);
			removed++;
		}
	}
	return removed;
}

function runPack(pack) {
	const bundle = loadBundle(pack.bundle);
	if (!bundle) {
		console.error(`  ! bundle missing: ${pack.bundle}`);
		return { written: 0, missing: 0, collisionsRenamed: 0 };
	}

	if (!noClean) {
		const removed = cleanPreviouslyGenerated(pack.genTag);
		console.log(
			`[${pack.prefix}] cleaned ${removed} previously-generated MDX`,
		);
	}

	const handCrafted = new Set(
		fs
			.readdirSync(ICONS_DIR)
			.filter((f) => f.endsWith('.mdx') && f !== 'index.mdx')
			.map((f) => f.replace(/\.mdx$/, '')),
	);

	const width = bundle.width ?? 24;
	const height = bundle.height ?? 24;

	let written = 0;
	let collisionsRenamed = 0;
	let missing = 0;

	for (const entry of pack.curated) {
		const icon = bundle.icons[entry.slug];
		if (!icon || !icon.body) {
			console.warn(`  [${pack.prefix}] missing slug: ${entry.slug}`);
			missing++;
			continue;
		}
		const svg = buildSvg(
			icon.body,
			icon.width ?? width,
			icon.height ?? height,
		);
		let finalRef = entry.ref;
		if (handCrafted.has(finalRef)) {
			finalRef = `${entry.ref}-${pack.suffix}`;
			if (handCrafted.has(finalRef)) continue;
			collisionsRenamed++;
		}
		const mdx = mdxForTerm(
			pack,
			{ ...entry, ref: finalRef },
			svg,
			icon.width ?? width,
			icon.height ?? height,
		);
		if (!dryRun) {
			fs.writeFileSync(path.join(ICONS_DIR, `${finalRef}.mdx`), mdx);
		}
		written++;
	}

	return { written, missing, collisionsRenamed };
}

function main() {
	const targets = onlyPack
		? PACKS.filter((p) => p.prefix === onlyPack)
		: PACKS;
	if (targets.length === 0) {
		console.error(`no pack matches: ${onlyPack}`);
		process.exit(1);
	}

	for (const pack of targets) {
		const r = runPack(pack);
		console.log(
			`[${pack.prefix}] wrote ${r.written} terms (${r.collisionsRenamed} collision-renamed), ${r.missing} missing source${dryRun ? ' (dry-run)' : ''}`,
		);
	}
}

main();
