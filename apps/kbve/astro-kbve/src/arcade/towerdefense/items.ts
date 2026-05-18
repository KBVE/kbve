export type ItemId = 'emergency_call_allies' | 'field_promotion';

export interface ItemDef {
	id: ItemId;
	name: string;
	description: string;
	color: number;
	defaultCharges: number;
	targeted: boolean;
}

export interface ItemInstance {
	id: ItemId;
	uid: number;
	charges: number;
}

export const ITEM_DEFS: Record<ItemId, ItemDef> = {
	emergency_call_allies: {
		id: 'emergency_call_allies',
		name: 'Call for Ally Nation',
		description:
			'Summons 20 ally soldiers. Lasts up to 5 waves or until they fall.',
		color: 0xf6ad55,
		defaultCharges: 1,
		targeted: false,
	},
	field_promotion: {
		id: 'field_promotion',
		name: 'Field Promotion',
		description:
			'Click a building to apply a free random upgrade to one of its tracks.',
		color: 0xb794f4,
		defaultCharges: 1,
		targeted: true,
	},
};

let nextUid = 1;

export function createItem(id: ItemId): ItemInstance {
	const def = ITEM_DEFS[id];
	return { id, uid: nextUid++, charges: def.defaultCharges };
}

export function defFor(id: ItemId): ItemDef {
	return ITEM_DEFS[id];
}
