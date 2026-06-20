import type { KindEntry } from '@kbve/laser';
import type { EntityCat } from '../ecs/store';

export const KIND_CAT_PLAYER = 0;
export const KIND_CAT_NPC = 1;
export const KIND_CAT_ITEM = 2;

export interface KindResolvers {
	cat(kind: number): number;
	ref(kind: number): string | null;
	catName(kind: number): EntityCat;
}

export function makeKindResolvers(
	registry: Map<number, KindEntry>,
): KindResolvers {
	const cat = (kind: number): number =>
		registry.get(kind)?.cat ?? KIND_CAT_NPC;
	const ref = (kind: number): string | null =>
		registry.get(kind)?.ref ?? null;
	const catName = (kind: number): EntityCat => {
		const c = cat(kind);
		return c === KIND_CAT_PLAYER
			? 'player'
			: c === KIND_CAT_ITEM
				? 'item'
				: 'npc';
	};
	return { cat, ref, catName };
}
