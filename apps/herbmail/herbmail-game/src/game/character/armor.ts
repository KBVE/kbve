import { useSyncExternalStore } from 'react';

export type PartSet = 'KNGT' | 'SCFI09' | 'SCFI10' | 'HORR01';

export interface ArmorStats {
	armor?: number;
	weight?: number;
}

export interface ArmorPiece {
	id: string;
	label: string;
	/** Mesh node names this piece owns (hidden together when removed). */
	slots: string[];
	/** Body location for mutual exclusion — one equipped piece per slotKey. */
	slotKey: string;
	set: PartSet;
	/** Extra base meshes this piece fully encloses (hidden while worn), on top
	 *  of the slotKey's own coverage — e.g. full helms swallow the HAIR. */
	covers?: string[];
	stats?: ArmorStats;
}

// The naked body: the human-species skin (SKIN_* nodes baked in by
// attach_skin_body.py) plus 38WRAP underwear and the face. These ARE the
// character and stay visible no matter what is unequipped — every outfit mesh is
// a removable overlay layered on top. An armor piece must never own one of these,
// or removing it would delete the body.
export const BODY_BASE = new Set([
	'SKIN_TORS',
	'SKIN_HIPS',
	'SKIN_LEGL',
	'SKIN_LEGR',
	'SKIN_HNDL',
	'SKIN_HNDR',
	'SKIN_FOTL',
	'SKIN_FOTR',
	'SKIN_AUPL',
	'SKIN_AUPR',
	'SKIN_ALWL',
	'SKIN_ALWR',
	'SKIN_WRAP',
	'HEAD',
	'HAIR',
	'EARL',
	'EARR',
	'EBRL',
	'EBRR',
	'EYEL',
	'EYER',
	'NOSE',
	'TETH',
	'TONG',
]);

/**
 * Removable outfit layers over the permanent {@link BODY_BASE}. Knight pieces
 * live in character-anim.glb; SCFI09/SCFI10/HORR01 pieces are lazy-loaded from
 * public/models/parts/ and rebound onto the rig (partsLoader.ts). Pieces sharing
 * a slotKey are mutually exclusive — equipping one evicts the other.
 */
export const ARMOR_PIECES: ArmorPiece[] = [
	{
		id: 'helmet',
		label: 'Helmet',
		slots: ['AHED'],
		slotKey: 'AHED',
		set: 'KNGT',
		covers: ['HAIR', 'SCFI09_HAIR'],
		stats: { armor: 3, weight: 4 },
	},
	{
		id: 'eyePatch',
		label: 'Eye Patch',
		slots: ['AFAC'],
		slotKey: 'AFAC',
		set: 'KNGT',
		stats: { weight: 1 },
	},
	{
		id: 'backpack',
		label: 'Backpack',
		slots: ['ABAC'],
		slotKey: 'ABAC',
		set: 'KNGT',
		stats: { weight: 3 },
	},
	{
		id: 'chest',
		label: 'Chest',
		slots: ['TORS'],
		slotKey: 'TORS',
		set: 'KNGT',
		stats: { armor: 4, weight: 6 },
	},
	{
		id: 'pauldronL',
		label: 'Pauldron (L)',
		slots: ['ASHL'],
		slotKey: 'ASHL',
		set: 'KNGT',
		stats: { armor: 2, weight: 2 },
	},
	{
		id: 'pauldronR',
		label: 'Pauldron (R)',
		slots: ['ASHR'],
		slotKey: 'ASHR',
		set: 'KNGT',
		stats: { armor: 2, weight: 2 },
	},
	{
		id: 'upperArmL',
		label: 'Upper Arm (L)',
		slots: ['AUPL'],
		slotKey: 'AUPL',
		set: 'KNGT',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'upperArmR',
		label: 'Upper Arm (R)',
		slots: ['AUPR'],
		slotKey: 'AUPR',
		set: 'KNGT',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'elbowL',
		label: 'Elbow Guard (L)',
		slots: ['AEBL'],
		slotKey: 'AEBL',
		set: 'KNGT',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'elbowR',
		label: 'Elbow Guard (R)',
		slots: ['AEBR'],
		slotKey: 'AEBR',
		set: 'KNGT',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'bracerL',
		label: 'Bracer (L)',
		slots: ['ALWL'],
		slotKey: 'ALWL',
		set: 'KNGT',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'bracerR',
		label: 'Bracer (R)',
		slots: ['ALWR'],
		slotKey: 'ALWR',
		set: 'KNGT',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'gauntletL',
		label: 'Gauntlet (L)',
		slots: ['HNDL'],
		slotKey: 'HNDL',
		set: 'KNGT',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'gauntletR',
		label: 'Gauntlet (R)',
		slots: ['HNDR'],
		slotKey: 'HNDR',
		set: 'KNGT',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'hips',
		label: 'Hips',
		slots: ['HIPS'],
		slotKey: 'HIPS',
		set: 'KNGT',
		stats: { armor: 2, weight: 3 },
	},
	{
		id: 'fauldFront',
		label: 'Fauld (Front)',
		slots: ['AHPF'],
		slotKey: 'AHPF',
		set: 'KNGT',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'fauldBack',
		label: 'Fauld (Back)',
		slots: ['AHPB'],
		slotKey: 'AHPB',
		set: 'KNGT',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'fauldLeft',
		label: 'Fauld (Left)',
		slots: ['AHPL'],
		slotKey: 'AHPL',
		set: 'KNGT',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'fauldRight',
		label: 'Fauld (Right)',
		slots: ['AHPR'],
		slotKey: 'AHPR',
		set: 'KNGT',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'legL',
		label: 'Leg (L)',
		slots: ['LEGL'],
		slotKey: 'LEGL',
		set: 'KNGT',
		stats: { armor: 2, weight: 2 },
	},
	{
		id: 'legR',
		label: 'Leg (R)',
		slots: ['LEGR'],
		slotKey: 'LEGR',
		set: 'KNGT',
		stats: { armor: 2, weight: 2 },
	},
	{
		id: 'kneeL',
		label: 'Knee Guard (L)',
		slots: ['AKNL'],
		slotKey: 'AKNL',
		set: 'KNGT',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'kneeR',
		label: 'Knee Guard (R)',
		slots: ['AKNR'],
		slotKey: 'AKNR',
		set: 'KNGT',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'bootL',
		label: 'Boot (L)',
		slots: ['FOTL'],
		slotKey: 'FOTL',
		set: 'KNGT',
		stats: { armor: 1, weight: 2 },
	},
	{
		id: 'bootR',
		label: 'Boot (R)',
		slots: ['FOTR'],
		slotKey: 'FOTR',
		set: 'KNGT',
		stats: { armor: 1, weight: 2 },
	},

	{
		id: 'scifi09Hair',
		label: 'Hair (Sci-fi)',
		slots: ['SCFI09_HAIR'],
		slotKey: 'HAIR',
		set: 'SCFI09',
		stats: {},
	},
	{
		id: 'scifi09Visor',
		label: 'Visor',
		slots: ['SCFI09_AHED'],
		slotKey: 'AHED',
		set: 'SCFI09',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'scifi09Mask',
		label: 'Face Mask',
		slots: ['SCFI09_AFAC'],
		slotKey: 'AFAC',
		set: 'SCFI09',
		stats: { weight: 1 },
	},
	{
		id: 'scifi09Pack',
		label: 'Tech Pack',
		slots: ['SCFI09_ABAC'],
		slotKey: 'ABAC',
		set: 'SCFI09',
		stats: { weight: 2 },
	},
	{
		id: 'scifi09Jacket',
		label: 'Jacket',
		slots: ['SCFI09_TORS'],
		slotKey: 'TORS',
		set: 'SCFI09',
		stats: { armor: 1, weight: 2 },
	},
	{
		id: 'scifi09SleeveL',
		label: 'Sleeve (L)',
		slots: ['SCFI09_AUPL'],
		slotKey: 'AUPL',
		set: 'SCFI09',
		stats: { weight: 1 },
	},
	{
		id: 'scifi09SleeveR',
		label: 'Sleeve (R)',
		slots: ['SCFI09_AUPR'],
		slotKey: 'AUPR',
		set: 'SCFI09',
		stats: { weight: 1 },
	},
	{
		id: 'scifi09CuffL',
		label: 'Cuff (L)',
		slots: ['SCFI09_ALWL'],
		slotKey: 'ALWL',
		set: 'SCFI09',
		stats: { weight: 1 },
	},
	{
		id: 'scifi09CuffR',
		label: 'Cuff (R)',
		slots: ['SCFI09_ALWR'],
		slotKey: 'ALWR',
		set: 'SCFI09',
		stats: { weight: 1 },
	},
	{
		id: 'scifi09GloveL',
		label: 'Glove (L)',
		slots: ['SCFI09_HNDL'],
		slotKey: 'HNDL',
		set: 'SCFI09',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'scifi09GloveR',
		label: 'Glove (R)',
		slots: ['SCFI09_HNDR'],
		slotKey: 'HNDR',
		set: 'SCFI09',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'scifi09Pants',
		label: 'Pants',
		slots: ['SCFI09_HIPS'],
		slotKey: 'HIPS',
		set: 'SCFI09',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'scifi09PantLegL',
		label: 'Pant Leg (L)',
		slots: ['SCFI09_LEGL'],
		slotKey: 'LEGL',
		set: 'SCFI09',
		stats: { weight: 1 },
	},
	{
		id: 'scifi09PantLegR',
		label: 'Pant Leg (R)',
		slots: ['SCFI09_LEGR'],
		slotKey: 'LEGR',
		set: 'SCFI09',
		stats: { weight: 1 },
	},
	{
		id: 'scifi09SneakerL',
		label: 'Sneaker (L)',
		slots: ['SCFI09_FOTL'],
		slotKey: 'FOTL',
		set: 'SCFI09',
		stats: { weight: 1 },
	},
	{
		id: 'scifi09SneakerR',
		label: 'Sneaker (R)',
		slots: ['SCFI09_FOTR'],
		slotKey: 'FOTR',
		set: 'SCFI09',
		stats: { weight: 1 },
	},
	{
		id: 'scifi09PouchF',
		label: 'Pouch (Front)',
		slots: ['SCFI09_AHPF'],
		slotKey: 'AHPF',
		set: 'SCFI09',
		stats: { weight: 1 },
	},
	{
		id: 'scifi09PouchB',
		label: 'Pouch (Back)',
		slots: ['SCFI09_AHPB'],
		slotKey: 'AHPB',
		set: 'SCFI09',
		stats: { weight: 1 },
	},
	{
		id: 'scifi09PouchL',
		label: 'Pouch (Left)',
		slots: ['SCFI09_AHPL'],
		slotKey: 'AHPL',
		set: 'SCFI09',
		stats: { weight: 1 },
	},
	{
		id: 'scifi09PouchR',
		label: 'Pouch (Right)',
		slots: ['SCFI09_AHPR'],
		slotKey: 'AHPR',
		set: 'SCFI09',
		stats: { weight: 1 },
	},
	{
		id: 'scifi09ShoulderL',
		label: 'Shoulder Pad (L)',
		slots: ['SCFI09_ASHL'],
		slotKey: 'ASHL',
		set: 'SCFI09',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'scifi09ShoulderR',
		label: 'Shoulder Pad (R)',
		slots: ['SCFI09_ASHR'],
		slotKey: 'ASHR',
		set: 'SCFI09',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'scifi09ElbowL',
		label: 'Elbow Pad (L)',
		slots: ['SCFI09_AEBL'],
		slotKey: 'AEBL',
		set: 'SCFI09',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'scifi09ElbowR',
		label: 'Elbow Pad (R)',
		slots: ['SCFI09_AEBR'],
		slotKey: 'AEBR',
		set: 'SCFI09',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'scifi09KneeL',
		label: 'Knee Pad (L)',
		slots: ['SCFI09_AKNL'],
		slotKey: 'AKNL',
		set: 'SCFI09',
		stats: { armor: 1, weight: 1 },
	},
	{
		id: 'scifi09KneeR',
		label: 'Knee Pad (R)',
		slots: ['SCFI09_AKNR'],
		slotKey: 'AKNR',
		set: 'SCFI09',
		stats: { armor: 1, weight: 1 },
	},

	{
		id: 'scifi10Helmet',
		label: 'Sci-fi Helmet',
		slots: ['SCFI10_AHED'],
		slotKey: 'AHED',
		set: 'SCFI10',
		covers: ['HAIR', 'SCFI09_HAIR'],
		stats: { armor: 2, weight: 2 },
	},
	{
		id: 'scifi10PouchB',
		label: 'Utility Pouch (Back)',
		slots: ['SCFI10_AHPB'],
		slotKey: 'AHPB',
		set: 'SCFI10',
		stats: { weight: 1 },
	},
	{
		id: 'scifi10PouchL',
		label: 'Utility Pouch (Left)',
		slots: ['SCFI10_AHPL'],
		slotKey: 'AHPL',
		set: 'SCFI10',
		stats: { weight: 1 },
	},
	{
		id: 'scifi10PouchR',
		label: 'Utility Pouch (Right)',
		slots: ['SCFI10_AHPR'],
		slotKey: 'AHPR',
		set: 'SCFI10',
		stats: { weight: 1 },
	},
	{
		id: 'scifi10ShoulderL',
		label: 'Armored Shoulder (L)',
		slots: ['SCFI10_ASHL'],
		slotKey: 'ASHL',
		set: 'SCFI10',
		stats: { armor: 2, weight: 2 },
	},
	{
		id: 'scifi10ShoulderR',
		label: 'Armored Shoulder (R)',
		slots: ['SCFI10_ASHR'],
		slotKey: 'ASHR',
		set: 'SCFI10',
		stats: { armor: 2, weight: 2 },
	},

	{
		id: 'horr01Helmet',
		label: 'Villain Helm',
		slots: ['HORR01_AHED'],
		slotKey: 'AHED',
		set: 'HORR01',
		covers: ['HAIR', 'SCFI09_HAIR'],
		stats: { armor: 2, weight: 3 },
	},
];

export const PIECE_BY_ID = new Map(ARMOR_PIECES.map((p) => [p.id, p]));
const SLOT_BY_PIECE = new Map(ARMOR_PIECES.map((p) => [p.id, p.slots]));

// Base meshes fully enclosed by an equipped piece in the given slotKey — hidden
// while covered so the two skinned meshes don't z-fight, restored on unequip.
const BASE_COVERED_BY_KEY = new Map<string, string>([
	['HNDL', 'SKIN_HNDL'],
	['HNDR', 'SKIN_HNDR'],
	['TORS', 'SKIN_TORS'],
	['HIPS', 'SKIN_HIPS'],
	['LEGL', 'SKIN_LEGL'],
	['LEGR', 'SKIN_LEGR'],
	['FOTL', 'SKIN_FOTL'],
	['FOTR', 'SKIN_FOTR'],
	['HAIR', 'HAIR'],
]);

let equipped = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
	equipped = new Set(equipped);
	for (const l of listeners) l();
}

// One piece per slotKey: equipping into an occupied location takes the current
// occupant off first (it falls back into the grid via reconcileArmor).
function evictSlotKey(key: string) {
	for (const id of [...equipped]) {
		if (PIECE_BY_ID.get(id)?.slotKey === key) equipped.delete(id);
	}
}

export function toggleArmor(id: string) {
	setArmor(id, !equipped.has(id));
}

export function setArmor(id: string, on: boolean) {
	if (on === equipped.has(id)) return;
	if (on) {
		const piece = PIECE_BY_ID.get(id);
		if (!piece) return;
		evictSlotKey(piece.slotKey);
		equipped.add(id);
	} else {
		equipped.delete(id);
	}
	emit();
}

export function setAllArmor(on: boolean) {
	equipped = on
		? new Set(ARMOR_PIECES.filter((p) => p.set === 'KNGT').map((p) => p.id))
		: new Set();
	for (const l of listeners) l();
}

export function getEquipped() {
	return equipped;
}

/** Sum of a stat over the equipped pieces — combat reads gear from here. */
export function equippedStat(
	key: keyof ArmorStats,
	set: Set<string> = equipped,
): number {
	let total = 0;
	for (const id of set) {
		total += PIECE_BY_ID.get(id)?.stats?.[key] ?? 0;
	}
	return total;
}

/** Lazy-loadable part sets referenced by an equipped-piece set. */
export function setsFor(equippedSet: Set<string>): PartSet[] {
	const sets = new Set<PartSet>();
	for (const id of equippedSet) {
		const p = PIECE_BY_ID.get(id);
		if (p && p.set !== 'KNGT') sets.add(p.set);
	}
	return [...sets];
}

const PIECE_BY_SLOT = new Map<string, string>();
for (const p of ARMOR_PIECES)
	for (const s of p.slots) PIECE_BY_SLOT.set(s, p.id);

// Bare-skin twin mesh → the first-registered piece that covers it, so clicking
// exposed skin re-equips a covering piece rather than dead-ending on a mesh
// that has vanished.
const PIECE_BY_SKIN = new Map<string, string>();
for (const p of ARMOR_PIECES) {
	const base = BASE_COVERED_BY_KEY.get(p.slotKey);
	if (base && base !== 'HAIR' && !PIECE_BY_SKIN.has(base))
		PIECE_BY_SKIN.set(base, p.id);
}

/** Armor piece id a hovered/clicked mesh belongs to (its slot, or the skin it
 *  covers), or null for un-equippable body meshes. */
export function pieceForMesh(name: string | undefined): string | null {
	if (!name) return null;
	return PIECE_BY_SLOT.get(name) ?? PIECE_BY_SKIN.get(name) ?? null;
}

/** Mesh node names hidden for a given equipped set: nodes of un-equipped pieces
 *  plus the base meshes covered by the pieces that ARE equipped. */
export function hiddenSlotsFor(equippedSet: Set<string>): Set<string> {
	const hidden = new Set<string>();
	for (const p of ARMOR_PIECES) {
		if (!equippedSet.has(p.id)) {
			for (const s of SLOT_BY_PIECE.get(p.id)!) {
				if (!BODY_BASE.has(s)) hidden.add(s);
			}
		} else {
			const base = BASE_COVERED_BY_KEY.get(p.slotKey);
			if (base) hidden.add(base);
			for (const c of p.covers ?? []) hidden.add(c);
		}
	}
	return hidden;
}

/** Slot-mesh names currently hidden (owned by un-equipped pieces). */
export function hiddenSlots(): Set<string> {
	return hiddenSlotsFor(equipped);
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

export function subscribeArmor(cb: () => void) {
	return subscribe(cb);
}

export function useEquippedArmor() {
	return useSyncExternalStore(subscribe, getEquipped, getEquipped);
}
