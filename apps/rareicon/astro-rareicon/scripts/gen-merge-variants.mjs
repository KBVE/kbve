#!/usr/bin/env node
/**
 * Post-process merger that consolidates per-pack `<ref>-{tabler,phosphor,
 * game}.mdx` files into a single base `<ref>.mdx` IconTerm with variants
 * from every source pack.
 *
 * Why: each per-pack codegen script (gen-tabler-icons / gen-phosphor-icons
 * / gen-gameicons) renames on collision so packs don't clobber each other.
 * The catalog ends up with `sword.mdx` (Lucide outline) plus
 * `sword-tabler.mdx`, `sword-phosphor.mdx`, `sword-game.mdx`. This pass
 * folds the suffix files' variants into the base mdx so a search for
 * "sword" lands on one page that shows every visual treatment side by
 * side.
 *
 * Algorithm:
 *   1. Walk icons/, find every `<ref>-<pack>.mdx` where `<pack>` is one
 *      of tabler / phosphor / game.
 *   2. If `<ref>.mdx` exists AND was generator-emitted (lucide /
 *      simple-icons-generated tag prefix or already merged), parse its
 *      frontmatter, append the suffix file's `icons[]` entries, merge
 *      `tags`, `categories`, `pagefindFilters`, and refresh the term
 *      description to advertise the multi-source coverage.
 *   3. Delete the suffix file.
 *   4. Hand-crafted bases (not generated) are left alone — assume the
 *      author chose to keep the variant separate.
 *
 * The merger is idempotent: re-running with no suffix files left does
 * nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ICONS_DIR = path.resolve(__dirname, '../src/content/docs/icons');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const PACK_SUFFIXES = ['tabler', 'phosphor', 'game'];
const PACK_RE = new RegExp(`^(.+)-(${PACK_SUFFIXES.join('|')})\\.mdx$`);

/**
 * Parse an MDX file into `{ frontmatter, body }`. The frontmatter is the
 * raw YAML between the first two `---` lines; everything after is the
 * MDX body (imports + JSX).
 */
function readMdx(file) {
	const raw = fs.readFileSync(file, 'utf8');
	const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!m) return null;
	const fm = yaml.load(m[1]);
	return { frontmatter: fm, body: m[2], raw };
}

function writeMdx(file, frontmatter, body) {
	const fmYaml = yaml.dump(frontmatter, {
		lineWidth: -1, // keep long URLs on one line
		noRefs: true,
	});
	const out = `---\n${fmYaml}---\n${body}`;
	fs.writeFileSync(file, out);
}

/**
 * Determine whether the base mdx is generator-emitted and therefore
 * eligible for variant injection. Hand-crafted files (with their own
 * narrative bodies + curated frontmatter) are left untouched so the
 * merger never overwrites manual content.
 */
function isGenerated(frontmatter) {
	const tags = frontmatter?.tags ?? [];
	if (!Array.isArray(tags)) return false;
	const sentinel = (t) =>
		typeof t === 'string' &&
		(t === 'lucide' ||
			t === 'simple-icons-generated' ||
			t === 'tabler-generated' ||
			t === 'phosphor-generated' ||
			t === 'game-icons-generated' ||
			t === 'merged-multi-source');
	return tags.some(sentinel);
}

function arrayMerge(a = [], b = []) {
	const out = Array.isArray(a) ? [...a] : [];
	for (const v of Array.isArray(b) ? b : []) {
		if (!out.includes(v)) out.push(v);
	}
	return out;
}

/**
 * Inject one suffix-pack term's icons[] entries into the base mdx
 * frontmatter. Mutates `base` in place; returns the count of variants
 * actually added (so duplicates by `ref` are skipped — re-running stays
 * idempotent).
 */
function mergeFrontmatter(base, suffix, pack) {
	let added = 0;
	const baseRefs = new Set(
		(base.icons ?? []).map((i) => i?.ref).filter(Boolean),
	);
	const incoming = suffix.icons ?? [];
	const remapped = incoming.map((variant) => {
		const ref = variant?.ref ?? pack;
		// Namespace incoming variant refs with the pack name so the term
		// can carry e.g. "outline" (lucide) + "outline" (tabler) without
		// the second collapsing into the first.
		const namespacedRef =
			ref === pack || ref.startsWith(`${pack}-`)
				? ref
				: `${pack}-${ref}`;
		return { ...variant, ref: namespacedRef };
	});
	for (const v of remapped) {
		if (baseRefs.has(v.ref)) continue;
		base.icons = base.icons ?? [];
		base.icons.push(v);
		baseRefs.add(v.ref);
		added++;
	}

	// Tag + category merge
	base.tags = arrayMerge(base.tags, suffix.tags);
	if (!base.tags.includes('merged-multi-source')) {
		base.tags.push('merged-multi-source');
	}
	base.categories = arrayMerge(base.categories, suffix.categories);
	base.pagefindFilters = arrayMerge(
		base.pagefindFilters,
		suffix.pagefindFilters,
	);

	// Refresh description to advertise multi-source coverage when
	// variants land in plurality. Keep the original wording verbatim
	// when only one source is present.
	const total = base.icons?.length ?? 0;
	if (total > 1) {
		base.description = `${base.name ?? base.ref ?? 'Icon'} glyph with ${total} variants from multiple FOSS icon libraries — recolor via currentColor.`;
	}

	return added;
}

function main() {
	if (!fs.existsSync(ICONS_DIR)) {
		console.error(`icons dir not found: ${ICONS_DIR}`);
		process.exit(1);
	}

	let merged = 0;
	let variantsAdded = 0;
	let skippedHandCrafted = 0;
	let skippedNoBase = 0;

	for (const f of fs.readdirSync(ICONS_DIR)) {
		const m = f.match(PACK_RE);
		if (!m) continue;
		const baseRef = m[1];
		const pack = m[2];
		const suffixFile = path.join(ICONS_DIR, f);
		const baseFile = path.join(ICONS_DIR, `${baseRef}.mdx`);

		const suffixDoc = readMdx(suffixFile);
		if (!suffixDoc) continue;

		if (!fs.existsSync(baseFile)) {
			// No matching base — promote suffix file to base ref.
			const newPath = path.join(ICONS_DIR, `${baseRef}.mdx`);
			suffixDoc.frontmatter.ref = baseRef;
			if (!dryRun) {
				writeMdx(newPath, suffixDoc.frontmatter, suffixDoc.body);
				fs.unlinkSync(suffixFile);
			}
			skippedNoBase++;
			continue;
		}

		const baseDoc = readMdx(baseFile);
		if (!baseDoc) continue;

		if (!isGenerated(baseDoc.frontmatter)) {
			skippedHandCrafted++;
			continue;
		}

		const added = mergeFrontmatter(
			baseDoc.frontmatter,
			suffixDoc.frontmatter,
			pack,
		);
		variantsAdded += added;
		merged++;

		if (!dryRun) {
			writeMdx(baseFile, baseDoc.frontmatter, baseDoc.body);
			fs.unlinkSync(suffixFile);
		}
	}

	console.log(
		`merged ${merged} files (${variantsAdded} new variants), promoted ${skippedNoBase} suffix-only files to base ref, skipped ${skippedHandCrafted} hand-crafted bases${dryRun ? ' (dry-run)' : ''}`,
	);
}

main();
