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
// Ammunition is under-annotated in the source data: only a handful of items
// carry an explicit `ammunition` block, while arrows/bolts/javelins live in the
// `ammo` equip slot and cannonballs + thrown weapons (darts, knives) carry no
// ammo signal at all. Union those sources so the category page is complete.
const AMMO_NAME =
	/\b(arrow|bolts?|dart|knife|knives|javelin|cannonball|thrownaxe|throwing axe)\b/i;
function isAmmunition(o: OSRSExtended): boolean {
	if (o.ammunition) return true;
	if (o.equipment?.slot === 'ammo') return true;
	return AMMO_NAME.test(o.name ?? '');
}

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
	if (isAmmunition(o)) tags.push(OSRS_TAGS.ammo);
	if (o.prayer) tags.push(OSRS_TAGS.prayer);
	return tags;
}
