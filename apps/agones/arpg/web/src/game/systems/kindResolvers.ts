import { Cat, type KindEntry, type EntityCat } from '@kbve/laser';

export interface KindResolvers {
	// Numeric entity category (Cat.*), matching the wire `KindEntry.cat`.
	cat(kind: number): EntityCat;
	ref(kind: number): string | null;
}

export function makeKindResolvers(
	registry: Map<number, KindEntry>,
): KindResolvers {
	const cat = (kind: number): EntityCat =>
		(registry.get(kind)?.cat as EntityCat) ?? Cat.Npc;
	const ref = (kind: number): string | null =>
		registry.get(kind)?.ref ?? null;
	return { cat, ref };
}
