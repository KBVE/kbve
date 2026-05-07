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

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const ICONS_DIR = path.resolve(WORKSPACE_ROOT, 'apps/rareicon/astro-rareicon/src/content/docs/icons');

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
		prefix: 'material-symbols',
		bundle: 'node_modules/@iconify-json/material-symbols/icons.json',
		suffix: 'material',
		genTag: 'material-symbols-generated',
		license: 'apache_2',
		licenseLine: 'Material Symbols (https://fonts.google.com/icons) — Apache 2.0',
		author: 'Google LLC',
		homeUrl: 'https://fonts.google.com/icons',
		sourceUrlPrefix: 'https://fonts.google.com/icons?icon.query=',
		pagefindFilter: 'material-symbols',
		curated: [
			{ slug: 'home', ref: 'home-material', cat: 'navigation' },
			{ slug: 'storefront', ref: 'storefront', cat: 'commerce' },
			{ slug: 'shopping-cart', ref: 'shopping-cart-material', cat: 'commerce' },
			{ slug: 'payments', ref: 'payments', cat: 'commerce' },
			{ slug: 'account-balance-wallet', ref: 'account-balance-wallet', cat: 'commerce' },
			{ slug: 'sports-esports', ref: 'sports-esports', cat: 'game' },
			{ slug: 'sports-mma', ref: 'sports-mma', cat: 'game' },
			{ slug: 'casino', ref: 'casino', cat: 'game' },
			{ slug: 'extension', ref: 'extension', cat: 'tech' },
			{ slug: 'memory', ref: 'memory-material', cat: 'tech' },
			{ slug: 'storage', ref: 'storage', cat: 'tech' },
			{ slug: 'cloud', ref: 'cloud-material', cat: 'tech' },
			{ slug: 'cloud-queue', ref: 'cloud-queue', cat: 'tech' },
			{ slug: 'auto-awesome', ref: 'auto-awesome', cat: 'game' },
			{ slug: 'bolt', ref: 'bolt-material', cat: 'game' },
			{ slug: 'workspace-premium', ref: 'workspace-premium', cat: 'social' },
			{ slug: 'verified', ref: 'verified', cat: 'social' },
			{ slug: 'health-and-safety', ref: 'health-and-safety', cat: 'tech' },
			{ slug: 'medication', ref: 'medication', cat: 'tech' },
			{ slug: 'school', ref: 'school', cat: 'social' },
			{ slug: 'science', ref: 'science', cat: 'tech' },
			{ slug: 'biotech', ref: 'biotech', cat: 'tech' },
			{ slug: 'psychology', ref: 'psychology', cat: 'tech' },
			{ slug: 'travel-explore', ref: 'travel-explore', cat: 'navigation' },
			{ slug: 'flight-takeoff', ref: 'flight-takeoff', cat: 'navigation' },
			{ slug: 'directions-bike', ref: 'directions-bike', cat: 'navigation' },
			{ slug: 'directions-bus', ref: 'directions-bus', cat: 'navigation' },
			{ slug: 'directions-car', ref: 'directions-car', cat: 'navigation' },
			{ slug: 'electric-bolt', ref: 'electric-bolt', cat: 'tech' },
			{ slug: 'electric-car', ref: 'electric-car', cat: 'navigation' },
			{ slug: 'park', ref: 'park-material', cat: 'weather' },
			{ slug: 'forest', ref: 'forest', cat: 'weather' },
			{ slug: 'grass', ref: 'grass', cat: 'weather' },
			{ slug: 'recycling', ref: 'recycling', cat: 'weather' },
		],
	},
	{
		prefix: 'fluent',
		bundle: 'node_modules/@iconify-json/fluent/icons.json',
		suffix: 'fluent',
		genTag: 'fluent-generated',
		license: 'mit',
		licenseLine: 'Fluent UI System Icons (https://github.com/microsoft/fluentui-system-icons) — MIT License',
		author: 'Microsoft Corporation',
		homeUrl: 'https://github.com/microsoft/fluentui-system-icons',
		sourceUrlPrefix: 'https://github.com/microsoft/fluentui-system-icons/tree/main/assets/',
		pagefindFilter: 'fluent',
		curated: [
			{ slug: 'home-24-regular', ref: 'home-fluent', cat: 'navigation' },
			{ slug: 'apps-24-regular', ref: 'apps-fluent', cat: 'navigation' },
			{ slug: 'shopping-bag-24-regular', ref: 'shopping-bag-fluent', cat: 'commerce' },
			{ slug: 'wallet-24-regular', ref: 'wallet-fluent', cat: 'commerce' },
			{ slug: 'gift-24-regular', ref: 'gift-fluent', cat: 'commerce' },
			{ slug: 'trophy-24-regular', ref: 'trophy-fluent', cat: 'game' },
			{ slug: 'games-24-regular', ref: 'games', cat: 'game' },
			{ slug: 'sparkle-24-regular', ref: 'sparkle-fluent', cat: 'game' },
			{ slug: 'flash-24-regular', ref: 'flash-fluent', cat: 'game' },
			{ slug: 'rocket-24-regular', ref: 'rocket-fluent', cat: 'tech' },
			{ slug: 'bot-24-regular', ref: 'bot-fluent', cat: 'tech' },
			{ slug: 'cloud-24-regular', ref: 'cloud-fluent', cat: 'tech' },
			{ slug: 'database-24-regular', ref: 'database-fluent', cat: 'tech' },
			{ slug: 'server-24-regular', ref: 'server-fluent', cat: 'tech' },
			{ slug: 'organization-24-regular', ref: 'organization', cat: 'social' },
			{ slug: 'people-team-24-regular', ref: 'people-team', cat: 'social' },
			{ slug: 'person-24-regular', ref: 'person-fluent', cat: 'social' },
			{ slug: 'chat-24-regular', ref: 'chat-fluent', cat: 'comms' },
			{ slug: 'mail-24-regular', ref: 'mail-fluent', cat: 'comms' },
			{ slug: 'shield-24-regular', ref: 'shield-fluent', cat: 'game' },
			{ slug: 'lock-closed-24-regular', ref: 'lock-closed-fluent', cat: 'action' },
			{ slug: 'key-24-regular', ref: 'key-fluent', cat: 'action' },
			{ slug: 'eye-24-regular', ref: 'eye-fluent', cat: 'action' },
			{ slug: 'settings-24-regular', ref: 'settings-fluent', cat: 'tech' },
			{ slug: 'wrench-24-regular', ref: 'wrench-fluent', cat: 'tech' },
			{ slug: 'code-24-regular', ref: 'code-fluent', cat: 'tech' },
			{ slug: 'video-24-regular', ref: 'video-fluent', cat: 'media' },
			{ slug: 'mic-24-regular', ref: 'mic-fluent', cat: 'media' },
			{ slug: 'image-24-regular', ref: 'image-fluent', cat: 'media' },
			{ slug: 'music-note-1-24-regular', ref: 'music-note', cat: 'media' },
		],
	},
	{
		prefix: 'mdi',
		bundle: 'node_modules/@iconify-json/mdi/icons.json',
		suffix: 'mdi',
		genTag: 'mdi-generated',
		license: 'apache_2',
		licenseLine: 'Material Design Icons (https://pictogrammers.com/library/mdi/) — Apache 2.0',
		author: 'Pictogrammers contributors',
		homeUrl: 'https://pictogrammers.com/library/mdi/',
		sourceUrlPrefix: 'https://pictogrammers.com/library/mdi/icon/',
		pagefindFilter: 'mdi',
		curated: [
			{ slug: 'sword-cross', ref: 'sword-cross', cat: 'game' },
			{ slug: 'shield-sword', ref: 'shield-sword', cat: 'game' },
			{ slug: 'bow-arrow', ref: 'bow-arrow', cat: 'game' },
			{ slug: 'pistol', ref: 'pistol', cat: 'game' },
			{ slug: 'cards', ref: 'cards', cat: 'game' },
			{ slug: 'cards-playing', ref: 'cards-playing', cat: 'game' },
			{ slug: 'chess-knight', ref: 'chess-knight', cat: 'game' },
			{ slug: 'chess-rook', ref: 'chess-rook', cat: 'game' },
			{ slug: 'chess-queen', ref: 'chess-queen', cat: 'game' },
			{ slug: 'dice-multiple', ref: 'dice-multiple', cat: 'game' },
			{ slug: 'controller-classic', ref: 'controller-classic', cat: 'game' },
			{ slug: 'gamepad-variant', ref: 'gamepad-variant', cat: 'game' },
			{ slug: 'arrow-projectile', ref: 'arrow-projectile', cat: 'game' },
			{ slug: 'pickaxe', ref: 'pickaxe-mdi', cat: 'game' },
			{ slug: 'mine', ref: 'mine', cat: 'game' },
			{ slug: 'tower-fire', ref: 'tower-fire', cat: 'game' },
			{ slug: 'town-hall', ref: 'town-hall', cat: 'game' },
			{ slug: 'horse', ref: 'horse', cat: 'game' },
			{ slug: 'ufo-outline', ref: 'ufo-mdi', cat: 'game' },
			{ slug: 'ghost-outline', ref: 'ghost-mdi', cat: 'game' },
			{ slug: 'snake', ref: 'snake', cat: 'game' },
			{ slug: 'spider', ref: 'spider', cat: 'game' },
			{ slug: 'jellyfish', ref: 'jellyfish', cat: 'game' },
			{ slug: 'pirate', ref: 'pirate', cat: 'game' },
			{ slug: 'wizard-hat', ref: 'wizard-hat', cat: 'game' },
			{ slug: 'bottle-tonic', ref: 'bottle-tonic', cat: 'game' },
			{ slug: 'flask-empty', ref: 'flask-empty', cat: 'tech' },
			{ slug: 'flask-round-bottom', ref: 'flask-round-bottom', cat: 'tech' },
			{ slug: 'panda', ref: 'panda-mdi', cat: 'social' },
			{ slug: 'pine-tree-fire', ref: 'pine-tree-fire', cat: 'weather' },
		],
	},
	{
		prefix: 'akar-icons',
		bundle: 'node_modules/@iconify-json/akar-icons/icons.json',
		suffix: 'akar',
		genTag: 'akar-icons-generated',
		license: 'mit',
		licenseLine: 'Akar Icons (https://akaricons.com/) — MIT License',
		author: 'Arturo Wibawa',
		homeUrl: 'https://akaricons.com/',
		sourceUrlPrefix: 'https://akaricons.com/',
		pagefindFilter: 'akar-icons',
		curated: [
			{ slug: 'home', ref: 'home', cat: 'navigation' },
			{ slug: 'compass', ref: 'compass', cat: 'navigation' },
			{ slug: 'cart', ref: 'cart', cat: 'commerce' },
			{ slug: 'paypal-fill', ref: 'paypal', cat: 'commerce' },
			{ slug: 'shipping-box-01', ref: 'shipping-box', cat: 'commerce' },
			{ slug: 'gear', ref: 'gear', cat: 'tech' },
			{ slug: 'tools', ref: 'tools', cat: 'tech' },
			{ slug: 'cpu', ref: 'cpu', cat: 'tech' },
			{ slug: 'cloud-download', ref: 'cloud-download', cat: 'tech' },
			{ slug: 'cloud-upload', ref: 'cloud-upload', cat: 'tech' },
			{ slug: 'lock-on', ref: 'lock-on', cat: 'action' },
			{ slug: 'unlock', ref: 'unlock', cat: 'action' },
			{ slug: 'shield', ref: 'shield', cat: 'game' },
			{ slug: 'trophy', ref: 'trophy', cat: 'game' },
			{ slug: 'flash', ref: 'flash', cat: 'game' },
			{ slug: 'sparkles', ref: 'sparkles', cat: 'game' },
			{ slug: 'heart', ref: 'heart', cat: 'social' },
			{ slug: 'person', ref: 'person', cat: 'social' },
			{ slug: 'people-multiple', ref: 'people-multiple', cat: 'social' },
			{ slug: 'envelope', ref: 'envelope', cat: 'comms' },
			{ slug: 'chat-bubble', ref: 'chat-bubble', cat: 'comms' },
			{ slug: 'paint-bucket', ref: 'paint-bucket', cat: 'tech' },
			{ slug: 'palette', ref: 'palette', cat: 'tech' },
		],
	},
	{
		prefix: 'radix-icons',
		bundle: 'node_modules/@iconify-json/radix-icons/icons.json',
		suffix: 'radix',
		genTag: 'radix-icons-generated',
		license: 'mit',
		licenseLine: 'Radix Icons (https://www.radix-ui.com/icons) — MIT License',
		author: 'WorkOS / Radix UI',
		homeUrl: 'https://www.radix-ui.com/icons',
		sourceUrlPrefix: 'https://www.radix-ui.com/icons',
		pagefindFilter: 'radix-icons',
		curated: [
			{ slug: 'home', ref: 'home', cat: 'navigation' },
			{ slug: 'archive', ref: 'archive', cat: 'tech' },
			{ slug: 'badge', ref: 'badge', cat: 'social' },
			{ slug: 'bookmark', ref: 'bookmark', cat: 'action' },
			{ slug: 'camera', ref: 'camera', cat: 'media' },
			{ slug: 'card-stack', ref: 'card-stack', cat: 'commerce' },
			{ slug: 'commit', ref: 'commit', cat: 'tech' },
			{ slug: 'cube', ref: 'cube', cat: 'tech' },
			{ slug: 'desktop', ref: 'desktop', cat: 'tech' },
			{ slug: 'envelope-closed', ref: 'envelope-closed', cat: 'comms' },
			{ slug: 'frame', ref: 'frame', cat: 'tech' },
			{ slug: 'globe', ref: 'globe', cat: 'navigation' },
			{ slug: 'keyboard', ref: 'keyboard', cat: 'tech' },
			{ slug: 'lightning-bolt', ref: 'lightning-bolt', cat: 'game' },
			{ slug: 'magic-wand', ref: 'magic-wand', cat: 'game' },
			{ slug: 'magnifying-glass', ref: 'magnifying-glass', cat: 'action' },
			{ slug: 'rocket', ref: 'rocket', cat: 'tech' },
			{ slug: 'star', ref: 'star', cat: 'social' },
		],
	},
	{
		prefix: 'lucide-lab',
		bundle: 'node_modules/@iconify-json/lucide-lab/icons.json',
		suffix: 'lab',
		genTag: 'lucide-lab-generated',
		license: 'isc',
		licenseLine: 'Lucide Lab (https://lucide.dev/lab) — ISC License',
		author: 'Lucide contributors',
		homeUrl: 'https://lucide.dev/lab',
		sourceUrlPrefix: 'https://lucide.dev/icons/',
		pagefindFilter: 'lucide-lab',
		curated: [
			{ slug: 'arrow-route', ref: 'arrow-route', cat: 'navigation' },
			{ slug: 'badge-bug', ref: 'badge-bug', cat: 'tech' },
			{ slug: 'bug-droid', ref: 'bug-droid', cat: 'tech' },
			{ slug: 'codepen-circle', ref: 'codepen-circle', cat: 'tech' },
			{ slug: 'crab', ref: 'crab', cat: 'social' },
			{ slug: 'dragon', ref: 'dragon', cat: 'game' },
			{ slug: 'flame-kindling', ref: 'flame-kindling', cat: 'game' },
			{ slug: 'flower', ref: 'flower', cat: 'weather' },
			{ slug: 'fungi', ref: 'fungi', cat: 'weather' },
			{ slug: 'glass-water', ref: 'glass-water', cat: 'commerce' },
			{ slug: 'heart-arrow', ref: 'heart-arrow', cat: 'social' },
			{ slug: 'house-plug', ref: 'house-plug', cat: 'tech' },
			{ slug: 'mushroom', ref: 'mushroom', cat: 'weather' },
			{ slug: 'octopus', ref: 'octopus', cat: 'game' },
			{ slug: 'piano', ref: 'piano', cat: 'media' },
			{ slug: 'pizza-slice', ref: 'pizza-slice', cat: 'commerce' },
			{ slug: 'snail', ref: 'snail', cat: 'social' },
			{ slug: 'sushi', ref: 'sushi', cat: 'commerce' },
			{ slug: 'unicorn-head', ref: 'unicorn-head', cat: 'game' },
		],
	},
	{
		prefix: 'solar',
		bundle: 'node_modules/@iconify-json/solar/icons.json',
		suffix: 'solar',
		genTag: 'solar-generated',
		license: 'cc_by',
		licenseLine: 'Solar Icons (https://solar-icons.com/) — CC BY 4.0 — 480 Design',
		author: '480 Design',
		homeUrl: 'https://solar-icons.com/',
		sourceUrlPrefix: 'https://solar-icons.com/?icon=',
		pagefindFilter: 'solar',
		curated: [
			{ slug: 'home-2-bold-duotone', ref: 'home', cat: 'navigation' },
			{ slug: 'home-smile-bold-duotone', ref: 'home-smile', cat: 'navigation' },
			{ slug: 'shield-bold-duotone', ref: 'shield', cat: 'game' },
			{ slug: 'crown-bold-duotone', ref: 'crown', cat: 'game' },
			{ slug: 'cup-bold-duotone', ref: 'cup', cat: 'game' },
			{ slug: 'medal-star-bold-duotone', ref: 'medal-star', cat: 'game' },
			{ slug: 'magic-stick-3-bold-duotone', ref: 'magic-stick', cat: 'game' },
			{ slug: 'fire-bold-duotone', ref: 'fire', cat: 'game' },
			{ slug: 'bolt-bold-duotone', ref: 'bolt', cat: 'game' },
			{ slug: 'star-bold-duotone', ref: 'star', cat: 'social' },
			{ slug: 'heart-bold-duotone', ref: 'heart', cat: 'social' },
			{ slug: 'user-bold-duotone', ref: 'user', cat: 'social' },
			{ slug: 'users-group-rounded-bold-duotone', ref: 'users-group-rounded', cat: 'social' },
			{ slug: 'cart-large-bold-duotone', ref: 'cart-large', cat: 'commerce' },
			{ slug: 'wallet-bold-duotone', ref: 'wallet', cat: 'commerce' },
			{ slug: 'gift-bold-duotone', ref: 'gift', cat: 'commerce' },
			{ slug: 'rocket-2-bold-duotone', ref: 'rocket', cat: 'tech' },
			{ slug: 'cloud-bold-duotone', ref: 'cloud', cat: 'tech' },
			{ slug: 'database-bold-duotone', ref: 'database', cat: 'tech' },
			{ slug: 'planet-bold-duotone', ref: 'planet', cat: 'tech' },
			{ slug: 'leaf-bold-duotone', ref: 'leaf', cat: 'weather' },
			{ slug: 'sun-bold-duotone', ref: 'sun', cat: 'weather' },
			{ slug: 'moon-bold-duotone', ref: 'moon', cat: 'weather' },
		],
	},
	{
		prefix: 'mingcute',
		bundle: 'node_modules/@iconify-json/mingcute/icons.json',
		suffix: 'mingcute',
		genTag: 'mingcute-generated',
		license: 'apache_2',
		licenseLine: 'MingCute Icons (https://www.mingcute.com/) — Apache 2.0',
		author: 'MingCute Design',
		homeUrl: 'https://www.mingcute.com/',
		sourceUrlPrefix: 'https://www.mingcute.com/?keyword=',
		pagefindFilter: 'mingcute',
		curated: [
			{ slug: 'home-1-line', ref: 'home', cat: 'navigation' },
			{ slug: 'compass-line', ref: 'compass', cat: 'navigation' },
			{ slug: 'shopping-cart-1-line', ref: 'shopping-cart', cat: 'commerce' },
			{ slug: 'wallet-2-line', ref: 'wallet', cat: 'commerce' },
			{ slug: 'gift-line', ref: 'gift', cat: 'commerce' },
			{ slug: 'shield-shape-line', ref: 'shield-shape', cat: 'game' },
			{ slug: 'sword-line', ref: 'sword', cat: 'game' },
			{ slug: 'magic-1-line', ref: 'magic', cat: 'game' },
			{ slug: 'flash-line', ref: 'flash', cat: 'game' },
			{ slug: 'crown-line', ref: 'crown', cat: 'game' },
			{ slug: 'rocket-line', ref: 'rocket', cat: 'tech' },
			{ slug: 'cloud-line', ref: 'cloud', cat: 'tech' },
			{ slug: 'cpu-line', ref: 'cpu', cat: 'tech' },
			{ slug: 'code-line', ref: 'code', cat: 'tech' },
			{ slug: 'gameconsole-line', ref: 'gameconsole', cat: 'game' },
			{ slug: 'pumpkin-2-line', ref: 'pumpkin', cat: 'game' },
			{ slug: 'unicorn-line', ref: 'unicorn', cat: 'game' },
			{ slug: 'dragon-line', ref: 'dragon', cat: 'game' },
			{ slug: 'campfire-line', ref: 'campfire', cat: 'game' },
			{ slug: 'sparkles-2-line', ref: 'sparkles', cat: 'game' },
			{ slug: 'plant-line', ref: 'plant', cat: 'weather' },
			{ slug: 'flower-3-line', ref: 'flower', cat: 'weather' },
			{ slug: 'heart-line', ref: 'heart', cat: 'social' },
			{ slug: 'star-line', ref: 'star', cat: 'social' },
			{ slug: 'user-3-line', ref: 'user', cat: 'social' },
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
	const file = path.resolve(PACKAGE_ROOT, relPath);
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
	default_license={frontmatter.default_license}
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
