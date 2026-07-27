/**
 * Runtime professiondb barrel — the single typed entry point for the
 * proto-canonical profession catalog.
 *
 * The codegen (gen-professiondb-data.mjs) emits `professiondb-data.json` in
 * proto-canonical form: camelCase keys + prefixed enum values
 * (PROFESSION_CATEGORY_*, CURVE_KIND_*). The unified type (`Profession`, from the
 * proto-generated `professiondb-schema.ts`) describes the authoring shape:
 * snake_case keys + bare enum values. This loader inverts the exact transform the
 * generator applies, so every consumer reads ONE typed pool through the same
 * `Profession` type.
 */
import rawProfessiondb from './generated/professiondb-data.json';
import type {
	Profession,
	ProfessionRegistry,
} from './generated/professiondb-schema';

export type {
	Profession,
	ProfessionRegistry,
	ProfessionAction,
	ProfessionUnlock,
	ResourceAmount,
	ExperienceCurve,
	ProfessionCategoryValue,
	CurveKindValue,
} from './generated/professiondb-schema';

// Mirror of ENUM_PREFIX in gen-professiondb-data.mjs (keyed by camelCase field name).
const ENUM_PREFIX: Record<string, string> = {
	category: 'PROFESSION_CATEGORY_',
	kind: 'CURVE_KIND_',
};

function camelToSnake(key: string): string {
	return key.replace(/([A-Z])/g, '_$1').toLowerCase();
}

/** Invert gen-professiondb-data's `transform`: camelCase→snake_case keys +
 * de-prefix the enum string leaves whose parent field carries a known prefix. */
function reverse(node: unknown, parentCamelKey = ''): unknown {
	if (node === null || node === undefined) return node;
	if (Array.isArray(node)) {
		return node.map((child) => reverse(child, parentCamelKey));
	}
	if (typeof node === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(node)) {
			out[camelToSnake(key)] = reverse(value, key);
		}
		return out;
	}
	if (typeof node === 'string' && ENUM_PREFIX[parentCamelKey]) {
		const prefix = ENUM_PREFIX[parentCamelKey];
		const bare = node.startsWith(prefix) ? node.slice(prefix.length) : node;
		return bare.toLowerCase();
	}
	return node;
}

let professionCache: Profession[] | null = null;

/** The full profession pool, normalized to the unified `Profession` shape. */
export function loadProfessions(): Profession[] {
	if (!professionCache) {
		const pool =
			(rawProfessiondb as { professions?: unknown[] }).professions ?? [];
		professionCache = pool.map((p) => reverse(p) as Profession);
	}
	return professionCache;
}

/** The pool wrapped as a `ProfessionRegistry` (matches `ProfessionRegistrySchema`). */
export function loadProfessionRegistry(): ProfessionRegistry {
	return { professions: loadProfessions() } as ProfessionRegistry;
}

let refIndex: Map<string, Profession> | null = null;

/** Look up a single profession by its `ref`. */
export function getProfession(ref: string): Profession | undefined {
	if (!refIndex) {
		refIndex = new Map(loadProfessions().map((p) => [p.ref, p]));
	}
	return refIndex.get(ref);
}
