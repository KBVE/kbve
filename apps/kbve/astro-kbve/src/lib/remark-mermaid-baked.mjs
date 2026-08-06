/**
 * remark-mermaid-baked
 *
 * Replaces every ```mermaid fence with the SVG that `scripts/gen-mermaid.mjs`
 * rendered ahead of time. Both theme variants are inlined; `mermaid.css` shows
 * whichever matches Starlight's `data-theme`. No mermaid runtime reaches the
 * browser, so pages with diagrams no longer block the main thread mid-scroll
 * while mermaid lays them out.
 *
 * A fence with no baked SVG is a build error — silently dropping a diagram is
 * worse than failing loudly, and the fix is one command.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { visit } from 'unist-util-visit';

const OUT_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	'../generated/mermaid',
);

/** @type {{ mermaidVersion: string, themes: string[], diagrams: Record<string, unknown> } | null} */
let manifest = null;
/** @type {Map<string, string>} */
const svgCache = new Map();

function loadManifest() {
	if (manifest) return manifest;
	try {
		manifest = JSON.parse(readFileSync(join(OUT_DIR, 'manifest.json'), 'utf-8'));
	} catch {
		throw new Error(
			'remark-mermaid-baked: src/generated/mermaid/manifest.json is missing. ' +
				'Run `pnpm nx run astro-kbve:gen:mermaid`.',
		);
	}
	return manifest;
}

/** Joins the hash inputs. Duplicated verbatim in `scripts/gen-mermaid.mjs`. */
const HASH_SEPARATOR = '::mermaid::';

/**
 * Must stay identical to `hashOf` in scripts/gen-mermaid.mjs — the two halves
 * of this pipeline agree on nothing else.
 *
 * @param {string} definition
 */
function hashOf(definition, mermaidVersion, config) {
	return createHash('sha256')
		.update(
			[mermaidVersion, JSON.stringify(config), definition].join(HASH_SEPARATOR),
		)
		.digest('hex')
		.slice(0, 16);
}

/** @param {string} file */
function readSvg(file) {
	let svg = svgCache.get(file);
	if (svg === undefined) {
		svg = readFileSync(join(OUT_DIR, file), 'utf-8');
		svgCache.set(file, svg);
	}
	return svg;
}

export default function remarkMermaidBaked() {
	return function transformer(tree, vfile) {
		const meta = loadManifest();

		visit(tree, 'code', (node, index, parent) => {
			if (node.lang !== 'mermaid') return;
			if (!parent || typeof index !== 'number') return;

			const hash = hashOf(node.value, meta.mermaidVersion, meta.config);
			if (!meta.diagrams[hash]) {
				throw new Error(
					`remark-mermaid-baked: no baked SVG for the mermaid block in ` +
						`${vfile?.path ?? 'unknown file'} (hash ${hash}). ` +
						'Run `pnpm nx run astro-kbve:gen:mermaid`.',
				);
			}

			const variants = meta.themes
				.map(
					(theme) =>
						`<div class="mermaid-diagram__svg mermaid-diagram__svg--${theme}">${readSvg(`${hash}.${theme}.svg`)}</div>`,
				)
				.join('');

			parent.children[index] = {
				type: 'html',
				value: `<figure class="mermaid-diagram not-content" data-mermaid="${hash}">${variants}</figure>`,
			};
		});
	};
}
