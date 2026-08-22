#!/usr/bin/env node
/**
 * Generate the shared NPC-ability locale tables from the MDX source of truth.
 *
 * Unlike every other gen-*-data.mjs this one emits no canonical registry. The
 * English name and description of an ability stay inline on `npc.NpcAbility`
 * inside npcdb, where rareicon (Unity), cryptothrone, the arpg Rust server and
 * friendslop already read them; nothing about their wire shape changes. What is
 * shared here is only the translation, because a handful of abilities are reused
 * across dozens of creatures:
 *
 *   tackle  19 npcs   bite  18 npcs   howl  18 npcs
 *
 * 110 ability descriptions across the catalog are 10 distinct sentences. Authored
 * per NPC, a translator would write the same line up to 19 times and the copies
 * would drift; keyed by ability id, once.
 *
 * The English `name`/`description` in an abilitydb entry is a contract rather than
 * a second source of truth: this generator fails when any npcdb use of that id
 * disagrees, so "these 19 copies are one string" is checked, not assumed.
 *
 * Coverage is opt-in. An ability with no MDX file here is simply not shared and
 * stays English everywhere, so adding the mechanism does not oblige anyone to
 * translate the other 38.
 *
 * Inputs:
 *   apps/kbve/astro-kbve/src/content/docs/abilitydb/*.mdx  (shared ability text)
 *   apps/kbve/astro-kbve/src/content/docs/npcdb/*.mdx      (English being asserted)
 *
 * Outputs:
 *   packages/data/codegen/generated/abilitydb.<locale>.json|.binpb
 *   apps/rareicon/unity-rareicon/Assets/StreamingAssets/abilitydb.<locale>.json|.binpb
 *   apps/friendslop/godot-friendslop/assets/abilitydb/abilitydb.<locale>.json|.binpb
 *
 * Usage:
 *   node packages/data/codegen/gen-abilitydb-data.mjs
 */

import {
	readFileSync,
	writeFileSync,
	readdirSync,
	mkdirSync,
	existsSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import {
	takeI18n,
	collectLocales,
	encodeLocaleTables,
	assertLocaleParity,
} from './lib/i18n-slice.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const abilitydbDir = resolve(
	repoRoot,
	'apps/kbve/astro-kbve/src/content/docs/abilitydb',
);
const npcdbDir = resolve(
	repoRoot,
	'apps/kbve/astro-kbve/src/content/docs/npcdb',
);
const generatedDir = resolve(__dirname, 'generated');

const DB = 'abilitydb';

/// Fields of an ability whose text is shareable. Everything else on NpcAbility is
/// a number, an enum or a slug, and is not language-dependent.
const TEXT_FIELDS = ['name', 'description'];

function loadSharedAbilities(locales) {
	const files = readdirSync(abilitydbDir).filter(
		(f) => f.endsWith('.mdx') && f !== 'index.mdx',
	);
	const shared = new Map();
	for (const file of files) {
		const { data } = matter(readFileSync(resolve(abilitydbDir, file), 'utf8'));
		// Lifted before anything else reads the entry; the same invariant every db holds.
		const i18n = takeI18n(data);
		if (!data.ref) continue;
		if (data.drafted === true) continue;
		const ref = String(data.ref);
		if (shared.has(ref)) {
			throw new Error(`abilitydb: two entries claim ref '${ref}'`);
		}
		const english = {};
		for (const field of TEXT_FIELDS) {
			if (typeof data[field] === 'string' && data[field].trim() !== '') {
				english[field] = data[field].trim();
			}
		}
		if (!english.name) {
			throw new Error(`abilitydb: '${ref}' has no English name to key against`);
		}
		shared.set(ref, { file, english });
		locales.add(ref, i18n);
	}
	return shared;
}

/// Every npcdb use of a shared ability id, so the English contract can be checked.
function collectNpcdbUses(ids) {
	const uses = new Map([...ids].map((id) => [id, []]));
	for (const file of readdirSync(npcdbDir)) {
		if (!file.endsWith('.mdx') || file === 'index.mdx') continue;
		const { data } = matter(readFileSync(resolve(npcdbDir, file), 'utf8'));
		if (!data.id || !data.ref || !data.name || data.drafted === true) continue;
		for (const ability of data.abilities ?? []) {
			const id = ability?.id ? String(ability.id) : '';
			if (!uses.has(id)) continue;
			uses.get(id).push({ npc: String(data.ref), ability });
		}
	}
	return uses;
}

function assertEnglishAgrees(shared, uses) {
	const problems = [];
	for (const [ref, { english }] of shared) {
		const found = uses.get(ref) ?? [];
		if (found.length === 0) {
			problems.push(`  '${ref}' is shared here but no npc uses it`);
			continue;
		}
		for (const { npc, ability } of found) {
			for (const field of TEXT_FIELDS) {
				const want = english[field];
				if (want === undefined) continue;
				const got =
					typeof ability[field] === 'string' ? ability[field].trim() : '';
				if (got !== want) {
					problems.push(
						`  ${npc}.abilities.${ref}.${field} is ${JSON.stringify(got)} but abilitydb/${ref}.mdx says ${JSON.stringify(want)}`,
					);
				}
			}
		}
	}
	if (problems.length > 0) {
		throw new Error(
			`abilitydb: English drifted from npcdb, so a single shared translation would be wrong for some npcs.\n${problems.join('\n')}\n` +
				'Either reconcile the npcdb entries, or stop sharing that ability by deleting its abilitydb file.',
		);
	}
}

function main() {
	const locales = collectLocales();
	const shared = loadSharedAbilities(locales);
	console.log(`Loaded ${shared.size} shared ability defs from MDX`);

	const uses = collectNpcdbUses(shared.keys());
	assertEnglishAgrees(shared, uses);
	for (const [ref] of shared) {
		console.log(`  ${ref}: ${uses.get(ref).length} npcs share this text`);
	}

	assertLocaleParity(locales, DB);

	const artifacts = encodeLocaleTables(locales, DB);
	if (artifacts.length === 0) {
		console.log('No translations authored yet; no tables written.');
		return;
	}

	const targets = [
		{ name: 'generated', dir: generatedDir },
		{
			name: 'rareicon',
			dir: resolve(
				repoRoot,
				'apps/rareicon/unity-rareicon/Assets/StreamingAssets',
			),
		},
		{
			name: 'friendslop',
			dir: resolve(repoRoot, 'apps/friendslop/godot-friendslop/assets/abilitydb'),
		},
	];
	for (const t of targets) {
		if (!existsSync(t.dir)) mkdirSync(t.dir, { recursive: true });
		for (const { table, encoded } of artifacts) {
			writeFileSync(
				resolve(t.dir, `${DB}.${table.locale}.json`),
				JSON.stringify(table),
			);
			writeFileSync(resolve(t.dir, `${DB}.${table.locale}.binpb`), encoded);
		}
		console.log(`Synced ${t.name} → ${t.dir}`);
	}
}

main();
