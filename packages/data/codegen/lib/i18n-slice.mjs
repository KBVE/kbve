/**
 * Shared i18n extraction for every MDX-backed database.
 *
 * Each MDX entry may carry an `i18n:` block keyed by locale, mirroring the entry's
 * own English field names:
 *
 *   name: 'Aetherfang'
 *   description: |
 *       Teal over black...
 *   i18n:
 *       es:
 *           name: 'Aetherfang'
 *           description: |
 *               Verde azulado sobre negro...
 *
 * The block is lifted out and flattened to "<ref>.<field path>" keys, then emitted
 * as a kbve.common.LocaleTable per locale. It never reaches the canonical registry:
 * the data generators encode with `ignoreUnknownFields: true`, so an i18n block left
 * in place would be dropped from the .binpb while still landing in the .json, and the
 * two artifacts would disagree with nothing to catch it.
 *
 * English is not a locale here. It stays in the registry and is the fallback for any
 * key a translation is missing.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFileRegistry, fromBinary, fromJson, toBinary } from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';

export const I18N_FIELD = 'i18n';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMON_DESCRIPTOR = resolve(__dirname, '../descriptors/common.binpb');

let _localeTableDesc = null;

function localeTableDesc() {
	if (_localeTableDesc) return _localeTableDesc;
	const fds = fromBinary(FileDescriptorSetSchema, readFileSync(COMMON_DESCRIPTOR));
	const desc = createFileRegistry(fds).getMessage('kbve.common.LocaleTable');
	if (!desc) {
		throw new Error(
			'kbve.common.LocaleTable not found in descriptors/common.binpb -- regenerate with: nx run data-proto:generate-zod',
		);
	}
	_localeTableDesc = desc;
	return desc;
}

/// Encode every collected locale as a kbve.common.LocaleTable.
/// Unknown fields are rejected rather than ignored: a shape the schema does not
/// describe must fail here, not vanish silently between the .json and the .binpb.
export function encodeLocaleTables(locales, db) {
	const desc = localeTableDesc();
	return locales.tables(db).map((table) => {
		const encoded = toBinary(
			desc,
			fromJson(desc, table, { ignoreUnknownFields: false }),
		);
		console.log(
			`Locale ${table.locale}: ${table.entries.length} strings (${encoded.length} bytes)`,
		);
		return { table, encoded };
	});
}

/// Pull `i18n` off one raw MDX frontmatter object, returning the block and leaving
/// the entry untouched. Returns null when the entry carries no translations.
export function takeI18n(data) {
	if (!data || typeof data !== 'object') return null;
	const block = data[I18N_FIELD];
	delete data[I18N_FIELD];
	if (!block || typeof block !== 'object' || Array.isArray(block)) return null;
	return block;
}

/// Flatten one locale's translations into "<ref>.<path>" -> string.
/// Arrays index numerically, so `abilities[1].name` becomes "ref.abilities.1.name".
export function flattenTranslations(ref, node, prefix = '', out = {}) {
	if (typeof node === 'string') {
		if (node.length > 0) out[prefix] = node;
		return out;
	}
	if (Array.isArray(node)) {
		node.forEach((v, i) => flattenTranslations(ref, v, `${prefix}.${i}`, out));
		return out;
	}
	if (node && typeof node === 'object') {
		for (const [k, v] of Object.entries(node)) {
			flattenTranslations(ref, v, prefix ? `${prefix}.${k}` : `${ref}.${k}`, out);
		}
	}
	return out;
}

/// Collect flattened tables for every locale seen across a run.
export function collectLocales() {
	const byLocale = new Map();
	// ref -> locale -> Set of field paths, kept alongside the flat tables so the
	// parity guard can reason per entry instead of over one undifferentiated pile
	// of keys.
	const byRef = new Map();
	return {
		add(ref, block) {
			if (!ref || !block) return;
			for (const [locale, fields] of Object.entries(block)) {
				if (!fields || typeof fields !== 'object') continue;
				if (!byLocale.has(locale)) byLocale.set(locale, {});
				const flat = flattenTranslations(ref, fields, '', {});
				Object.assign(byLocale.get(locale), flat);
				if (!byRef.has(ref)) byRef.set(ref, new Map());
				const perLocale = byRef.get(ref);
				if (!perLocale.has(locale)) perLocale.set(locale, new Set());
				const paths = perLocale.get(locale);
				for (const key of Object.keys(flat)) {
					paths.add(key.slice(ref.length + 1));
				}
			}
		},
		/// Fields an entry translates in at least one of its own locales but not in
		/// all of them.
		///
		/// Scope is per entry, and it is the entry's own declared locale set. An
		/// entry with no i18n block constrains nothing, and a field left in English
		/// across every locale of an entry is not in scope either -- only a field
		/// someone has already started translating is. That is what lets a guard
		/// exist at all while ~90 of 93 npcs are untranslated: it locks in the work
		/// that is done without demanding the work that is not.
		parityGaps() {
			const gaps = [];
			for (const [ref, perLocale] of [...byRef].sort()) {
				const locales = [...perLocale.keys()].sort();
				if (locales.length < 2) continue;
				const inScope = new Set();
				for (const paths of perLocale.values()) {
					for (const p of paths) inScope.add(p);
				}
				for (const locale of locales) {
					const have = perLocale.get(locale);
					const missing = [...inScope].filter((p) => !have.has(p)).sort();
					if (missing.length > 0) gaps.push({ ref, locale, missing });
				}
			}
			return gaps;
		},
		/// One kbve.common.LocaleTable per locale, entries sorted by key so the
		/// encoded bytes are stable across regenerations.
		tables(db) {
			return [...byLocale.keys()].sort().map((locale) => ({
				locale,
				db,
				entries: Object.entries(byLocale.get(locale))
					.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
					.map(([key, value]) => ({ key, value })),
			}));
		},
		locales() {
			return [...byLocale.keys()].sort();
		},
	};
}

/// Fail the generation rather than shipping a table that is half a language behind
/// its siblings. Silence here would surface as one Spanish ability sitting in a
/// Japanese tooltip, which nothing downstream can detect.
export function assertLocaleParity(locales, db) {
	const gaps = locales.parityGaps();
	if (gaps.length === 0) return;
	const lines = gaps.map(
		({ ref, locale, missing }) =>
			`  ${ref} [${locale}] is missing: ${missing.join(', ')}`,
	);
	throw new Error(
		`${db}: ${gaps.length} ${gaps.length === 1 ? 'entry translates' : 'entries translate'} a field in one language but not in another they also declare.\n` +
			`${lines.join('\n')}\n` +
			'Translate the listed fields, or drop the language from that entry entirely.',
	);
}
