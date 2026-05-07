#!/usr/bin/env node
/**
 * Generate IconTerm MDX files from the `simple-icons` npm package (CC0).
 *
 * Brand glyphs that fill gaps in the Lucide-driven catalog: Steam, itch.io,
 * Bluesky, TikTok, Spotify, Reddit, Mastodon, Threads, Patreon, Ko-fi,
 * gaming storefronts (Epic / GOG / PSN / Xbox), AI clouds (OpenAI /
 * Anthropic), etc.
 *
 * Hand-crafted MDX in src/content/docs/icons/ wins:
 * - If `<slug>.mdx` already exists (any source), the simple-icons entry is
 *   skipped so curated content stays intact.
 * - Previously-generated simple-icons MDX (detected via the
 *   `tags: [simple-icons-generated` marker) is deleted before regen.
 *
 * Usage:
 *   pnpm install   # ensure simple-icons is installed
 *   node apps/rareicon/astro-rareicon/scripts/gen-simple-icons.mjs
 *   node apps/rareicon/astro-rareicon/scripts/gen-simple-icons.mjs --dry-run
 *   node apps/rareicon/astro-rareicon/scripts/gen-simple-icons.mjs --no-clean
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const ICONS_DIR = path.resolve(__dirname, '../src/content/docs/icons');
const SI_ICONS_DIR = path.resolve(
	WORKSPACE_ROOT,
	'node_modules/simple-icons/icons',
);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const noClean = args.includes('--no-clean');

/**
 * Curated whitelist. Each entry maps a simple-icons slug → desired term ref.
 * If `ref` matches `slug`, MDX writes to `<slug>.mdx`. Compound slugs are
 * split (e.g. `nintendoswitch` → `nintendo-switch.mdx`) for readability and
 * to match the Lucide-style kebab-case ref convention.
 *
 * Curated to platforms relevant to the KBVE / RareIcon ecosystem. Avoid
 * conflicts with Lucide: Lucide-locked refs like `github`, `instagram`,
 * `slack`, `linkedin`, `figma`, `framer`, `gitlab`, `trello`, `dribbble`,
 * `codepen`, `codesandbox`, `chromium` already exist as Lucide outline
 * variants — those are intentionally excluded here.
 */
const CURATED = [
	// Gaming storefronts
	{ slug: 'epicgames', ref: 'epic-games', name: 'Epic Games', cat: 'gaming' },
	{ slug: 'gogdotcom', ref: 'gog', name: 'GOG', cat: 'gaming' },
	{ slug: 'humblebundle', ref: 'humble-bundle', name: 'Humble Bundle', cat: 'gaming' },
	{ slug: 'playstation', ref: 'playstation', name: 'PlayStation', cat: 'gaming' },
	{ slug: 'nintendoswitch', ref: 'nintendo-switch', name: 'Nintendo Switch', cat: 'gaming' },
	{ slug: 'gamejolt', ref: 'gamejolt', name: 'Game Jolt', cat: 'gaming' },
	{ slug: 'roblox', ref: 'roblox', name: 'Roblox', cat: 'gaming' },

	// Game engines / tools
	{ slug: 'unrealengine', ref: 'unreal-engine', name: 'Unreal Engine', cat: 'gaming' },
	{ slug: 'unity', ref: 'unity', name: 'Unity', cat: 'gaming' },
	{ slug: 'godotengine', ref: 'godot', name: 'Godot', cat: 'gaming' },
	{ slug: 'bevy', ref: 'bevy', name: 'Bevy', cat: 'gaming' },
	{ slug: 'gamemaker', ref: 'gamemaker', name: 'GameMaker', cat: 'gaming' },
	{ slug: 'construct3', ref: 'construct-3', name: 'Construct 3', cat: 'gaming' },
	{ slug: 'aseprite', ref: 'aseprite', name: 'Aseprite', cat: 'gaming' },
	{ slug: 'blender', ref: 'blender', name: 'Blender', cat: 'gaming' },
	{ slug: 'krita', ref: 'krita', name: 'Krita', cat: 'gaming' },
	{ slug: 'gimp', ref: 'gimp', name: 'GIMP', cat: 'gaming' },
	{ slug: 'rive', ref: 'rive', name: 'Rive', cat: 'gaming' },
	{ slug: 'minetest', ref: 'minetest', name: 'Minetest', cat: 'gaming' },

	// Streaming / video
	{ slug: 'kick', ref: 'kick', name: 'Kick', cat: 'media' },
	{ slug: 'vimeo', ref: 'vimeo', name: 'Vimeo', cat: 'media' },

	// Social
	{ slug: 'reddit', ref: 'reddit', name: 'Reddit', cat: 'social' },
	{ slug: 'mastodon', ref: 'mastodon', name: 'Mastodon', cat: 'social' },
	{ slug: 'threads', ref: 'threads', name: 'Threads', cat: 'social' },
	{ slug: 'pinterest', ref: 'pinterest', name: 'Pinterest', cat: 'social' },
	{ slug: 'snapchat', ref: 'snapchat', name: 'Snapchat', cat: 'social' },

	// Music
	{ slug: 'spotify', ref: 'spotify', name: 'Spotify', cat: 'media' },
	{ slug: 'soundcloud', ref: 'soundcloud', name: 'SoundCloud', cat: 'media' },
	{ slug: 'bandcamp', ref: 'bandcamp', name: 'Bandcamp', cat: 'media' },
	{ slug: 'tidal', ref: 'tidal', name: 'Tidal', cat: 'media' },

	// Comms
	{ slug: 'telegram', ref: 'telegram', name: 'Telegram', cat: 'comms' },
	{ slug: 'whatsapp', ref: 'whatsapp', name: 'WhatsApp', cat: 'comms' },
	{ slug: 'signal', ref: 'signal-messenger', name: 'Signal Messenger', cat: 'comms' },
	{ slug: 'matrix', ref: 'matrix', name: 'Matrix', cat: 'comms' },

	// Dev / collab
	{ slug: 'bitbucket', ref: 'bitbucket', name: 'Bitbucket', cat: 'tech' },
	{ slug: 'stackoverflow', ref: 'stack-overflow', name: 'Stack Overflow', cat: 'tech' },
	{ slug: 'devdotto', ref: 'dev-to', name: 'DEV Community', cat: 'tech' },
	{ slug: 'hashnode', ref: 'hashnode', name: 'Hashnode', cat: 'tech' },

	// Editors / IDE
	{ slug: 'neovim', ref: 'neovim', name: 'Neovim', cat: 'tech' },
	{ slug: 'jetbrains', ref: 'jetbrains', name: 'JetBrains', cat: 'tech' },
	{ slug: 'sublimetext', ref: 'sublime-text', name: 'Sublime Text', cat: 'tech' },
	{ slug: 'zedindustries', ref: 'zed', name: 'Zed', cat: 'tech' },
	{ slug: 'githubcopilot', ref: 'github-copilot', name: 'GitHub Copilot', cat: 'tech' },

	// Creator support
	{ slug: 'kofi', ref: 'kofi', name: 'Ko-fi', cat: 'commerce' },
	{ slug: 'patreon', ref: 'patreon', name: 'Patreon', cat: 'commerce' },
	{ slug: 'buymeacoffee', ref: 'buy-me-a-coffee', name: 'Buy Me a Coffee', cat: 'commerce' },
	{ slug: 'opencollective', ref: 'open-collective', name: 'Open Collective', cat: 'commerce' },
	{ slug: 'githubsponsors', ref: 'github-sponsors', name: 'GitHub Sponsors', cat: 'commerce' },

	// AI / ML
	{ slug: 'openai', ref: 'openai', name: 'OpenAI', cat: 'tech' },
	{ slug: 'anthropic', ref: 'anthropic', name: 'Anthropic', cat: 'tech' },
	{ slug: 'perplexity', ref: 'perplexity', name: 'Perplexity', cat: 'tech' },
	{ slug: 'huggingface', ref: 'hugging-face', name: 'Hugging Face', cat: 'tech' },
	{ slug: 'replicate', ref: 'replicate', name: 'Replicate', cat: 'tech' },
	{ slug: 'langchain', ref: 'langchain', name: 'LangChain', cat: 'tech' },
	{ slug: 'ollama', ref: 'ollama', name: 'Ollama', cat: 'tech' },
	{ slug: 'pytorch', ref: 'pytorch', name: 'PyTorch', cat: 'tech' },
	{ slug: 'tensorflow', ref: 'tensorflow', name: 'TensorFlow', cat: 'tech' },
	{ slug: 'keras', ref: 'keras', name: 'Keras', cat: 'tech' },
	{ slug: 'jupyter', ref: 'jupyter', name: 'Jupyter', cat: 'tech' },
	{ slug: 'pandas', ref: 'pandas', name: 'pandas', cat: 'tech' },
	{ slug: 'numpy', ref: 'numpy', name: 'NumPy', cat: 'tech' },
	{ slug: 'opencv', ref: 'opencv', name: 'OpenCV', cat: 'tech' },
	{ slug: 'kaggle', ref: 'kaggle', name: 'Kaggle', cat: 'tech' },
	{ slug: 'googlecolab', ref: 'google-colab', name: 'Google Colab', cat: 'tech' },

	// Cloud / infra
	{ slug: 'vercel', ref: 'vercel', name: 'Vercel', cat: 'tech' },
	{ slug: 'netlify', ref: 'netlify', name: 'Netlify', cat: 'tech' },
	{ slug: 'cloudflare', ref: 'cloudflare', name: 'Cloudflare', cat: 'tech' },
	{ slug: 'amazonwebservices', ref: 'aws', name: 'AWS', cat: 'tech' },
	{ slug: 'googlecloud', ref: 'google-cloud', name: 'Google Cloud', cat: 'tech' },
	{ slug: 'digitalocean', ref: 'digitalocean', name: 'DigitalOcean', cat: 'tech' },
	{ slug: 'hetzner', ref: 'hetzner', name: 'Hetzner', cat: 'tech' },
	{ slug: 'flydotio', ref: 'fly-io', name: 'Fly.io', cat: 'tech' },
	{ slug: 'railway', ref: 'railway', name: 'Railway', cat: 'tech' },
	{ slug: 'render', ref: 'render', name: 'Render', cat: 'tech' },

	// DevOps
	{ slug: 'docker', ref: 'docker', name: 'Docker', cat: 'tech' },
	{ slug: 'kubernetes', ref: 'kubernetes', name: 'Kubernetes', cat: 'tech' },
	{ slug: 'terraform', ref: 'terraform', name: 'Terraform', cat: 'tech' },
	{ slug: 'ansible', ref: 'ansible', name: 'Ansible', cat: 'tech' },
	{ slug: 'githubactions', ref: 'github-actions', name: 'GitHub Actions', cat: 'tech' },
	{ slug: 'jenkins', ref: 'jenkins', name: 'Jenkins', cat: 'tech' },
	{ slug: 'nixos', ref: 'nixos', name: 'NixOS', cat: 'tech' },

	// Languages
	{ slug: 'rust', ref: 'rust', name: 'Rust', cat: 'tech' },
	{ slug: 'go', ref: 'go', name: 'Go', cat: 'tech' },
	{ slug: 'python', ref: 'python', name: 'Python', cat: 'tech' },
	{ slug: 'typescript', ref: 'typescript', name: 'TypeScript', cat: 'tech' },
	{ slug: 'kotlin', ref: 'kotlin', name: 'Kotlin', cat: 'tech' },
	{ slug: 'swift', ref: 'swift', name: 'Swift', cat: 'tech' },
	{ slug: 'zig', ref: 'zig', name: 'Zig', cat: 'tech' },
	{ slug: 'dart', ref: 'dart', name: 'Dart', cat: 'tech' },
	{ slug: 'elixir', ref: 'elixir', name: 'Elixir', cat: 'tech' },

	// Frameworks / runtimes
	{ slug: 'react', ref: 'react', name: 'React', cat: 'tech' },
	{ slug: 'vuedotjs', ref: 'vue', name: 'Vue', cat: 'tech' },
	{ slug: 'svelte', ref: 'svelte', name: 'Svelte', cat: 'tech' },
	{ slug: 'astro', ref: 'astro', name: 'Astro', cat: 'tech' },
	{ slug: 'nextdotjs', ref: 'next-js', name: 'Next.js', cat: 'tech' },
	{ slug: 'remix', ref: 'remix', name: 'Remix', cat: 'tech' },
	{ slug: 'solid', ref: 'solid-js', name: 'SolidJS', cat: 'tech' },
	{ slug: 'qwik', ref: 'qwik', name: 'Qwik', cat: 'tech' },
	{ slug: 'htmx', ref: 'htmx', name: 'htmx', cat: 'tech' },
	{ slug: 'nodedotjs', ref: 'node-js', name: 'Node.js', cat: 'tech' },
	{ slug: 'deno', ref: 'deno', name: 'Deno', cat: 'tech' },
	{ slug: 'bun', ref: 'bun', name: 'Bun', cat: 'tech' },
	{ slug: 'nestjs', ref: 'nest-js', name: 'NestJS', cat: 'tech' },
	{ slug: 'django', ref: 'django', name: 'Django', cat: 'tech' },
	{ slug: 'flask', ref: 'flask-framework', name: 'Flask', cat: 'tech' },
	{ slug: 'fastapi', ref: 'fastapi', name: 'FastAPI', cat: 'tech' },
	{ slug: 'laravel', ref: 'laravel', name: 'Laravel', cat: 'tech' },
	{ slug: 'spring', ref: 'spring', name: 'Spring', cat: 'tech' },
	{ slug: 'tauri', ref: 'tauri', name: 'Tauri', cat: 'tech' },
	{ slug: 'electron', ref: 'electron', name: 'Electron', cat: 'tech' },

	// Databases / BaaS
	{ slug: 'postgresql', ref: 'postgresql', name: 'PostgreSQL', cat: 'tech' },
	{ slug: 'mongodb', ref: 'mongodb', name: 'MongoDB', cat: 'tech' },
	{ slug: 'redis', ref: 'redis', name: 'Redis', cat: 'tech' },
	{ slug: 'mysql', ref: 'mysql', name: 'MySQL', cat: 'tech' },
	{ slug: 'sqlite', ref: 'sqlite', name: 'SQLite', cat: 'tech' },
	{ slug: 'supabase', ref: 'supabase', name: 'Supabase', cat: 'tech' },
	{ slug: 'planetscale', ref: 'planetscale', name: 'PlanetScale', cat: 'tech' },
	{ slug: 'firebase', ref: 'firebase', name: 'Firebase', cat: 'tech' },
	{ slug: 'appwrite', ref: 'appwrite', name: 'Appwrite', cat: 'tech' },
	{ slug: 'pocketbase', ref: 'pocketbase', name: 'PocketBase', cat: 'tech' },
	{ slug: 'prisma', ref: 'prisma', name: 'Prisma', cat: 'tech' },
	{ slug: 'drizzle', ref: 'drizzle', name: 'Drizzle', cat: 'tech' },

	// Linux / OS
	{ slug: 'archlinux', ref: 'arch-linux', name: 'Arch Linux', cat: 'tech' },
	{ slug: 'ubuntu', ref: 'ubuntu', name: 'Ubuntu', cat: 'tech' },
	{ slug: 'debian', ref: 'debian', name: 'Debian', cat: 'tech' },
	{ slug: 'fedora', ref: 'fedora', name: 'Fedora', cat: 'tech' },

	// Reference
	{ slug: 'arxiv', ref: 'arxiv', name: 'arXiv', cat: 'tech' },
	{ slug: 'wikipedia', ref: 'wikipedia', name: 'Wikipedia', cat: 'tech' },
];

/**
 * Read a simple-icons SVG file and extract the path `d=` attribute.
 *
 * Simple Icons ships every glyph as a single-path 24×24 SVG with one
 * `<path d="...">` element. We strip the wrapping `<svg>` and the
 * decorative `<title>`, keep the path, and re-wrap with `currentColor` fill
 * so the icon recolors via CSS like the Lucide outlines do.
 */
function loadSiSvgBody(slug) {
	const file = path.join(SI_ICONS_DIR, `${slug}.svg`);
	if (!fs.existsSync(file)) return null;
	const raw = fs.readFileSync(file, 'utf8');
	const m = raw.match(/<path\s+d="([^"]+)"\s*\/?>/);
	if (!m) return null;
	const d = m[1];
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"` +
		` fill="currentColor"><path d="${d}"/></svg>`
	);
}

/**
 * Build MDX for a single brand term.
 *
 * Generated files carry the `tags: [simple-icons-generated, ...]` marker so
 * the cleanup pass can identify and remove stale outputs without touching
 * hand-crafted brand entries that use plain `tags: [simple-icons, brand]`.
 */
function mdxForBrand({ slug, ref, name, cat }, svgBody) {
	const keywords = JSON.stringify(
		Array.from(
			new Set([
				ref,
				...ref.split('-').filter((w) => w.length > 1),
				name.toLowerCase(),
				slug,
			]),
		),
	).slice(1, -1);

	return `---
ref: ${ref}
name: ${name}
title: ${name} Icon
description: ${name} brand glyph from the Simple Icons library (CC0), 1 variant — filled brand glyph, recolor via currentColor.
primary_category: ${cat}
categories: [${cat}, library, brand]
tags: [simple-icons-generated, brand]
search:
  keywords: [${keywords}]
  primary_category: ${cat}
default_license:
  license: cc0
  attribution_required: false
  attribution_line: "Simple Icons (https://simpleicons.org/) — CC0"
  author: Simple Icons contributors
  source_url: "https://simpleicons.org/icons/${slug}"
  commercial_use: true
  modifications_allowed: true
default_offering:
  offering: free
icons:
  - ref: "filled"
    label: "Filled"
    style: filled
    format: svg
    viewbox: { min_x: 0, min_y: 0, width: 24, height: 24 }
    render:
      uses_current_color: true
      monochrome: true
    recommended_sizes: [16, 20, 24, 32]
    tags: [simple-icons, brand]
    svg_body: |
      ${svgBody}
pagefindFilters: [simple-icons, ${cat}, brand]
---

import IconTermPanel from '@/components/icons/IconTermPanel.astro';

${name} — filled brand glyph from the [Simple Icons library](https://simpleicons.org/) (CC0).

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
		if (/^tags: \[simple-icons-generated/m.test(head)) {
			if (!dryRun) fs.unlinkSync(p);
			removed++;
		}
	}
	return removed;
}

async function main() {
	if (!fs.existsSync(SI_ICONS_DIR)) {
		console.error(
			`simple-icons package not found: ${SI_ICONS_DIR}\n` +
				`Run \`pnpm install\` first.`,
		);
		process.exit(1);
	}
	if (!fs.existsSync(ICONS_DIR)) {
		fs.mkdirSync(ICONS_DIR, { recursive: true });
	}

	if (!noClean) {
		const removed = cleanPreviouslyGenerated();
		console.log(`cleaned ${removed} previously-generated simple-icons MDX files`);
	}

	const handCraftedRefs = new Set(
		fs
			.readdirSync(ICONS_DIR)
			.filter((f) => f.endsWith('.mdx') && f !== 'index.mdx')
			.map((f) => f.replace(/\.mdx$/, '')),
	);

	let written = 0;
	let skippedHandCrafted = 0;
	let missingSource = 0;

	for (const entry of CURATED) {
		if (handCraftedRefs.has(entry.ref)) {
			skippedHandCrafted++;
			continue;
		}
		const svgBody = loadSiSvgBody(entry.slug);
		if (!svgBody) {
			console.warn(`  ! source SVG missing for slug: ${entry.slug}`);
			missingSource++;
			continue;
		}
		const mdx = mdxForBrand(entry, svgBody);
		if (!dryRun) {
			fs.writeFileSync(path.join(ICONS_DIR, `${entry.ref}.mdx`), mdx);
		}
		written++;
	}

	console.log(
		`wrote ${written} brand terms, skipped ${skippedHandCrafted} hand-crafted, ${missingSource} missing source${dryRun ? ' (dry-run)' : ''}`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
