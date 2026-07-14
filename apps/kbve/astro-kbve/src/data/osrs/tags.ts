import type { OSRSExtended } from '@/data/schema';
import { hasDropSources } from '@/data/schema/osrs/generated';

export const OSRS_TAGS = {
	food: 'food',
	potion: 'potion',
	equipment: 'equipment',
	quest: 'quest',
	drop: 'drop',
	farm: 'farm',
	gather: 'gather',
	teleport: 'teleport',
	ammo: 'ammo',
	prayer: 'prayer',
} as const;

export type OsrsTag = (typeof OSRS_TAGS)[keyof typeof OSRS_TAGS];

// Derive the coarse role tags for an item from its extended data. Shared by the
// browser index endpoint and the static category pages so both bucket items the
// same way.
export function buildOsrsTags(o: OSRSExtended): OsrsTag[] {
	const tags: OsrsTag[] = [];
	if (o.food) tags.push(OSRS_TAGS.food);
	if (o.potion) tags.push(OSRS_TAGS.potion);
	if (o.equipment) tags.push(OSRS_TAGS.equipment);
	if (o.quest_data) tags.push(OSRS_TAGS.quest);
	if (hasDropSources(o)) tags.push(OSRS_TAGS.drop);
	if (o.farming) tags.push(OSRS_TAGS.farm);
	if (o.gathering || o.woodcutting || o.mining || o.fishing)
		tags.push(OSRS_TAGS.gather);
	if (o.teleport) tags.push(OSRS_TAGS.teleport);
	if (o.ammunition) tags.push(OSRS_TAGS.ammo);
	if (o.prayer) tags.push(OSRS_TAGS.prayer);
	return tags;
}
