/**
 * Reverse "Used In" index, built once per build from every item's recipes.
 *
 * Each OSRS item's `recipes[]` frontmatter lists recipes that involve the
 * item — usually producing it, but also consuming it as a material. This
 * module scans the entire docs collection, indexes every recipe by each
 * material's slug, and exposes a lookup keyed by ingredient slug.
 *
 * Used by OSRSItemPanel as a fallback when an item has no hand-authored
 * `used_in:` frontmatter, so the "Used in production" table populates
 * automatically across the whole itemdb.
 */
import { getCollection } from 'astro:content';
import type { OSRSExtended, OSRSUsedIn } from '@/data/schema';

type UsedInIndex = Map<string, OSRSUsedIn[]>;

let _index: UsedInIndex | null = null;
let _building: Promise<UsedInIndex> | null = null;

export async function getUsedInIndex(): Promise<UsedInIndex> {
	if (_index) return _index;
	if (_building) return _building;
	_building = build();
	_index = await _building;
	_building = null;
	return _index;
}

function slugFromName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

async function build(): Promise<UsedInIndex> {
	const docs = await getCollection('docs');
	const byId = new Map<number, OSRSExtended>();
	const bySlug = new Map<string, OSRSExtended>();

	for (const entry of docs) {
		const o = (entry.data as { osrs?: OSRSExtended }).osrs;
		if (!o?.id || !o?.slug) continue;
		byId.set(o.id, o);
		bySlug.set(o.slug, o);
	}

	function resolveMaterialSlug(
		matId: number | undefined,
		matName: string,
	): string | undefined {
		if (matId !== undefined) {
			const item = byId.get(matId);
			if (item) return item.slug;
		}
		const guess = slugFromName(matName);
		if (bySlug.has(guess)) return guess;
		return undefined;
	}

	function resolveProduct(
		productId: number | undefined,
		productName: string | undefined,
		fallback: OSRSExtended,
	): { name: string; id: number; slug: string } {
		if (productId !== undefined) {
			const hit = byId.get(productId);
			if (hit) return { name: hit.name, id: hit.id, slug: hit.slug };
		}
		if (productName) {
			const guess = slugFromName(productName);
			const hit = bySlug.get(guess);
			if (hit) return { name: hit.name, id: hit.id, slug: hit.slug };
			return {
				name: productName,
				id: productId ?? fallback.id,
				slug: guess,
			};
		}
		return { name: fallback.name, id: fallback.id, slug: fallback.slug };
	}

	const index: UsedInIndex = new Map();
	const seen = new Map<string, Set<string>>();

	for (const entry of docs) {
		const host = (entry.data as { osrs?: OSRSExtended }).osrs;
		if (!host?.recipes?.length) continue;

		for (const recipe of host.recipes) {
			if (!recipe.materials?.length) continue;

			const product = resolveProduct(
				recipe.product_id ?? undefined,
				recipe.product ?? undefined,
				host,
			);

			for (const mat of recipe.materials) {
				const matSlug = resolveMaterialSlug(mat.item_id, mat.item_name);
				if (!matSlug) continue;
				if (matSlug === product.slug) continue;

				const dedupeKey = `${product.slug}|${recipe.skill ?? ''}|${recipe.level ?? ''}|${mat.quantity ?? ''}`;
				let seenSet = seen.get(matSlug);
				if (!seenSet) {
					seenSet = new Set();
					seen.set(matSlug, seenSet);
				}
				if (seenSet.has(dedupeKey)) continue;
				seenSet.add(dedupeKey);

				const usedInEntry: OSRSUsedIn = {
					product: product.name,
					product_id: product.id,
					slug: product.slug,
					skill: recipe.skill,
					level: recipe.level ?? null,
					xp: recipe.xp ?? null,
					quantity: mat.quantity ?? 1,
					members_only: recipe.members_only ?? undefined,
				};

				const bucket = index.get(matSlug);
				if (bucket) bucket.push(usedInEntry);
				else index.set(matSlug, [usedInEntry]);
			}
		}
	}

	return index;
}

export function lookupUsedIn(
	index: UsedInIndex,
	slug: string,
): OSRSUsedIn[] | undefined {
	return index.get(slug);
}
