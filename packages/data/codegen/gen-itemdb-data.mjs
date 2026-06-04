#!/usr/bin/env node
/**
 * Generate item data artifacts from the MDX source of truth.
 *
 * Inputs:
 *   apps/kbve/astro-kbve/src/content/docs/itemdb/*.mdx  (authoritative catalog)
 *   packages/data/codegen/descriptors/itemdb.binpb       (proto schema descriptor)
 *
 * Outputs (central — proto-canonical, for any cross-language consumer):
 *   packages/data/codegen/generated/itemdb-data.json      (camelCase + enum prefixes)
 *   packages/data/codegen/generated/itemdb-data.binpb     (wire-format proto binary)
 *
 * Outputs (per-game sync — Unity-friendly, raw frontmatter):
 *   apps/rareicon/unity-rareicon/Assets/StreamingAssets/itemdb.json
 *     — { version, count, entries: [...snake_case frontmatter...] }
 *     Mirrors the gen-mapdb-data.mjs wrapper convention so Newtonsoft can
 *     deserialise directly into an ItemDBBundle POCO (see ItemDBDef.cs).
 *   apps/rareicon/unity-rareicon/Assets/StreamingAssets/itemdb.binpb
 *     — Byte-for-byte copy of the central binpb. Lets future Burst / uniti
 *     paths consume the same wire format.
 *
 * Usage:
 *   node packages/data/codegen/gen-itemdb-data.mjs
 *   npx nx run astro-kbve:sync:itemdb
 */

import {
	readdirSync,
	readFileSync,
	writeFileSync,
	mkdirSync,
	existsSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import {
	fromBinary,
	toBinary,
	fromJson,
	createFileRegistry,
} from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

const MDX_DIR = resolve(
	repoRoot,
	'apps/kbve/astro-kbve/src/content/docs/itemdb',
);
const DESCRIPTOR_PATH = resolve(__dirname, 'descriptors/itemdb.binpb');
const GENERATED_DIR = resolve(__dirname, 'generated');
const CENTRAL_JSON = resolve(GENERATED_DIR, 'itemdb-data.json');
const CENTRAL_BINPB = resolve(GENERATED_DIR, 'itemdb-data.binpb');

// Per-game sync targets — each Unity game mirrors both formats into its
// StreamingAssets so the runtime loader finds them at boot, and gets
// ItemId.Generated.cs / ItemDBRefMap.Generated.cs dropped into Scripts/
// so new mdx entries flow through to C# without any handwritten edits.
const SYNC_TARGETS = [
	{
		name: 'rareicon',
		streamingAssetsDir: resolve(
			repoRoot,
			'apps/rareicon/unity-rareicon/Assets/StreamingAssets',
		),
		itemIdPath: resolve(
			repoRoot,
			'apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/DB/Items/Data/ItemId.Generated.cs',
		),
		refMapPath: resolve(
			repoRoot,
			'apps/rareicon/unity-rareicon/Assets/_RareIcon/Scripts/ECS/DB/Items/Data/ItemDBRefMap.Generated.cs',
		),
	},
];

// mdx `ref` slugs whose PascalCase would not match the existing ItemId
// enum member name. Empty by convention — every item's enum member name
// is the PascalCase of its mdx ref, with no manual aliasing.
const ENUM_NAME_ALIAS = {};

// Reserved for items that ever need a stable numeric id before their mdx
// file is authored. Empty under steady state, every item is mdx-first.
const LEGACY_ITEMS = [];

// Astro-only fields that have no place in the game-side JSON.
const ASTRO_ONLY = new Set([
	'title',
	'img',
	'icon',
	'pixel_density',
	'sorting_layer',
	'sorting_order',
	'effects',
	'equipped',
	'credits',
	'steam_market_url',
	'exchange_url',
	'drafted',
]);

// Proto enum prefixes — applied during proto-canonical JSON emission so
// Google.Protobuf.JsonParser (and equivalents in other languages) accept
// the enum values as fully-qualified strings.
const ENUM_PREFIX = {
	rarity: 'ITEM_RARITY_',
	slot: 'EQUIP_SLOT_',
	element: 'ELEMENT_',
	damageElement: 'ELEMENT_',
	skill: 'SKILLING_',
	type: 'USE_EFFECT_',
	special: 'GEAR_SPECIAL_',
	statusEffect: 'STATUS_EFFECT_',
};

function snakeToCamel(key) {
	return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function protoTransform(node, parentFieldCamel, coerceLeafToString = false) {
	if (node === null || node === undefined) return node;
	if (Array.isArray(node))
		return node.map((c) =>
			protoTransform(c, parentFieldCamel, coerceLeafToString),
		);
	if (typeof node === 'object') {
		const out = {};
		for (const [rawKey, rawValue] of Object.entries(node)) {
			const camelKey = snakeToCamel(rawKey);
			// ScriptBinding.vars is `map<string, string>` in the proto; Astro's
			// schema widens it to number|bool. Coerce at emission time.
			const nextCoerce = coerceLeafToString || camelKey === 'vars';
			out[camelKey] = protoTransform(rawValue, camelKey, nextCoerce);
		}
		return out;
	}
	if (coerceLeafToString && typeof node !== 'string') return String(node);
	if (
		parentFieldCamel &&
		ENUM_PREFIX[parentFieldCamel] &&
		typeof node === 'string'
	) {
		return `${ENUM_PREFIX[parentFieldCamel]}${node.toUpperCase()}`;
	}
	return node;
}

function loadAllMdx() {
	const files = readdirSync(MDX_DIR)
		.filter((f) => f.endsWith('.mdx') && f !== 'index.mdx')
		.sort();
	const records = [];
	for (const file of files) {
		const { data } = matter(readFileSync(resolve(MDX_DIR, file), 'utf8'));
		if (!data || typeof data !== 'object') continue;
		if (!data.ref || !data.name || data.key === undefined || !data.id) continue;
		if (data.drafted === true) continue;
		records.push(data);
	}
	return records;
}

function stripAstroFields(raw) {
	const game = {};
	for (const [k, v] of Object.entries(raw)) {
		if (ASTRO_ONLY.has(k)) continue;
		game[k] = v;
	}
	if (typeof raw.img === 'string' && raw.img.trim().length > 0) {
		game.hasImg = true;
	}
	return game;
}

function ensureDir(path) {
	if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function pascalCase(slug) {
	return slug
		.split('-')
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join('');
}

function enumNameForRef(ref) {
	return ENUM_NAME_ALIAS[ref] ?? pascalCase(ref);
}

function buildEnumMembers(records) {
	const byName = new Map();
	const members = [];
	for (const r of records) {
		const name = enumNameForRef(r.ref);
		if (byName.has(name)) {
			throw new Error(
				`Duplicate ItemId name '${name}' — refs '${r.ref}' and '${byName.get(name)}' both resolve to it`,
			);
		}
		if (r.key > 65535) {
			throw new Error(
				`Item '${r.ref}' has key ${r.key} which overflows ushort; ItemId enum is repr u16`,
			);
		}
		byName.set(name, r.ref);
		members.push({ name, id: r.key, ref: r.ref });
	}
	for (const legacy of LEGACY_ITEMS) {
		if (byName.has(legacy.name)) continue;
		byName.set(legacy.name, null);
		members.push({ name: legacy.name, id: legacy.id });
	}
	const byId = new Map();
	for (const m of members) {
		if (byId.has(m.id)) {
			throw new Error(
				`Duplicate ItemId numeric id ${m.id}: '${m.name}' collides with '${byId.get(m.id)}'`,
			);
		}
		byId.set(m.id, m.name);
	}
	members.sort((a, b) => a.id - b.id);
	return members;
}

function emitItemIdSource(members) {
	const lines = [
		'// <auto-generated/>',
		'// Source: packages/data/codegen/gen-itemdb-data.mjs',
		'// Regenerate: npx nx run astro-kbve:sync:itemdb',
		'',
		'namespace RareIcon',
		'{',
		'    /// <summary>mdx-driven item identifiers. Numeric values are each mdx `key`; legacy-only members live in the 60000+ range until they graduate to mdx.</summary>',
		'    public enum ItemId : ushort',
		'    {',
	];
	for (const m of members) {
		const comment = m.ref ? `  // ${m.ref}` : '  // legacy';
		lines.push(`        ${m.name} = ${m.id},${comment}`);
	}
	lines.push('    }');
	lines.push('}');
	return lines.join('\n') + '\n';
}

function emitRefMapSource(members) {
	const mdxMembers = members.filter((m) => m.ref);
	const lines = [
		'// <auto-generated/>',
		'// Source: packages/data/codegen/gen-itemdb-data.mjs',
		'// Regenerate: npx nx run astro-kbve:sync:itemdb',
		'',
		'using System.Collections.Generic;',
		'',
		'namespace RareIcon',
		'{',
		'    /// <summary>Generated mdx ref → <see cref="ItemId"/> lookup. <see cref="ItemDB"/> walks <see cref="ItemDBCache"/> and resolves each entry through this map to materialise its blittable <see cref="ItemDef"/>.</summary>',
		'    public static class ItemDBRefMap',
		'    {',
		'        public static readonly IReadOnlyDictionary<string, ItemId> RefToId = new Dictionary<string, ItemId>',
		'        {',
	];
	for (const m of mdxMembers) {
		lines.push(`            { "${m.ref}", ItemId.${m.name} },`);
	}
	lines.push('        };');
	lines.push('    }');
	lines.push('}');
	return lines.join('\n') + '\n';
}

function main() {
	const records = loadAllMdx();
	console.log(`Loaded ${records.length} items from MDX`);

	// 1. Unity-friendly bundle (raw snake_case, wrapped).
	const unityEntries = records.map(stripAstroFields);
	const unityBundle = {
		version: 1,
		count: unityEntries.length,
		entries: unityEntries,
	};
	const unityJson = JSON.stringify(unityBundle, null, 2) + '\n';

	// 2. Proto-canonical bundle (camelCase + enum prefixes) for cross-lang.
	const protoItems = unityEntries.map((entry) => protoTransform(entry));
	const protoBundle = { items: protoItems };

	// 3. Encode to proto binary using the descriptor reflection.
	const descBytes = readFileSync(DESCRIPTOR_PATH);
	const fds = fromBinary(FileDescriptorSetSchema, descBytes);
	const registry = createFileRegistry(fds);
	const itemRegistryDesc = registry.getMessage('item.ItemRegistry');
	if (!itemRegistryDesc) {
		console.error(
			'FATAL: item.ItemRegistry descriptor not found in itemdb.binpb',
		);
		process.exit(1);
	}
	const msg = fromJson(itemRegistryDesc, protoBundle, {
		ignoreUnknownFields: true,
	});
	const wire = toBinary(itemRegistryDesc, msg);

	// 4. Write central artifacts.
	ensureDir(GENERATED_DIR);
	writeFileSync(CENTRAL_JSON, JSON.stringify(protoBundle, null, 2));
	writeFileSync(CENTRAL_BINPB, wire);
	console.log(`Wrote ${CENTRAL_JSON}`);
	console.log(`Wrote ${CENTRAL_BINPB} (${wire.length} bytes)`);

	// 5. Build ItemId enum + ref map from mdx + legacy holdouts.
	const members = buildEnumMembers(records);
	const itemIdSource = emitItemIdSource(members);
	const refMapSource = emitRefMapSource(members);
	const mdxCount = members.filter((m) => m.ref).length;
	const legacyCount = members.length - mdxCount;
	console.log(
		`Built ItemId enum: ${members.length} members (${mdxCount} mdx + ${legacyCount} legacy)`,
	);

	// 6. Sync per-game.
	for (const t of SYNC_TARGETS) {
		ensureDir(t.streamingAssetsDir);
		writeFileSync(resolve(t.streamingAssetsDir, 'itemdb.json'), unityJson);
		writeFileSync(resolve(t.streamingAssetsDir, 'itemdb.binpb'), wire);
		ensureDir(dirname(t.itemIdPath));
		ensureDir(dirname(t.refMapPath));
		writeFileSync(t.itemIdPath, itemIdSource);
		writeFileSync(t.refMapPath, refMapSource);
		console.log(`Synced ${t.name} → ${t.streamingAssetsDir}`);
		console.log(`         ${t.itemIdPath}`);
		console.log(`         ${t.refMapPath}`);
	}
}

main();
