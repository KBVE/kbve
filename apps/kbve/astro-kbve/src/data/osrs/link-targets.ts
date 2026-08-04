/**
 * Resolver for internal OSRS cross-links.
 *
 * `related_items` entries were authored by the v4 enrichment pass rather than
 * generated from the corpus, so their `slug` and `item_id` fields drift from
 * what actually exists on disk. Measured across the corpus:
 *
 *   4019  slug resolves to a page
 *    167  slug resolves to a collapsed family member (308 to the base page)
 *    104  page exists under a different slug ("ahrims-hood" vs "ahrim-s-hood")
 *      5  collapsed variant under a slug families.json never assigned
 *    556  no page anywhere — 480 of those name items that are not GE-tradeable
 *          (charged forms, ornament variants, clue rewards, quest items) and
 *          so will never have a price page
 *
 * Resolution runs slug, then name. `item_id` is deliberately NOT consulted:
 * 1219 entries carry an id that disagrees with their own name and slug (id
 * 6016 is labelled "Basket of tomatoes" but belongs to cactus-spine), so
 * falling back to it would turn a dead link into a confidently wrong one.
 * Name and slug agree in every observed mismatch, which makes name the
 * trustworthy field.
 *
 * Recoverable cases therefore repair themselves at render time instead of
 * requiring edits across 461 files. Anything still unresolved returns null and
 * the caller renders plain text rather than a link into a 404.
 */
import { getCollection } from 'astro:content';
import type { OSRSExtended } from '@/data/schema';

export interface LinkTargets {
	/** Page slugs, plus collapsed family member slugs that 308 to a base page. */
	slugs: Set<string>;
	byName: Map<string, string>;
}

let _targets: LinkTargets | null = null;
let _building: Promise<LinkTargets> | null = null;

export async function getLinkTargets(): Promise<LinkTargets> {
	if (_targets) return _targets;
	_building ??= build();
	_targets = await _building;
	_building = null;
	return _targets;
}

async function build(): Promise<LinkTargets> {
	const docs = await getCollection('docs');
	const slugs = new Set<string>();
	const byName = new Map<string, string>();

	for (const entry of docs) {
		const item = (entry.data as { osrs?: OSRSExtended }).osrs;
		if (!item?.slug) continue;

		slugs.add(item.slug);
		if (item.name) byName.set(item.name.trim().toLowerCase(), item.slug);

		// Collapsed variants have no page of their own; their slugs 308 to this
		// page at the axum layer, so they stay valid link targets and resolve
		// by name to the base page they redirect to.
		for (const member of item.family?.members ?? []) {
			if (member.slug) slugs.add(member.slug);
			if (member.name && !byName.has(member.name.trim().toLowerCase())) {
				byName.set(member.name.trim().toLowerCase(), item.slug);
			}
		}
	}

	return { slugs, byName };
}

export function resolveItemSlug(
	targets: LinkTargets,
	slug: string | undefined,
	name: string | undefined,
): string | null {
	if (slug && targets.slugs.has(slug)) return slug;
	if (name) {
		const byName = targets.byName.get(name.trim().toLowerCase());
		if (byName) return byName;
	}
	return null;
}
