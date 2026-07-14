import { useSyncExternalStore } from 'react';
import { itemLabel, itemStat, sidekickModels } from '../data/itemdb';

export type PartSet = 'KNGT' | 'SCFI09' | 'SCFI10' | 'HORR01';

export interface ArmorPiece {
	/** itemdb ref — identity, label, stats and prices all resolve from MDX. */
	id: string;
	/** Mesh node names this piece owns (hidden together when removed). Kept
	 *  per-limb even for set items so future limb damage / prosthetics can
	 *  hide or replace one side. */
	slots: string[];
	/** Body locations occupied — one equipped piece per key; a set item holds
	 *  several (both shoulders, all four faulds). */
	slotKeys: string[];
	set: PartSet;
	/** Extra base meshes this piece fully encloses (hidden while worn), on top
	 *  of the slotKeys' own coverage — e.g. full helms swallow the HAIR. */
	covers?: string[];
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
 * Removable outfit layers over the permanent {@link BODY_BASE}, built from the
 * itemdb bundle: every item whose `model.pack` is SIDEKICK is a wardrobe
 * piece — one per equipment SET (pairs/quads are single items; meshes stay
 * individually named for limb-level systems). Knight meshes live in
 * character-anim.glb; the other sets lazy-load from public/models/parts/
 * (partsLoader.ts). Pieces sharing any slotKey are mutually exclusive.
 * Adding an item = author its MDX (with a model block) and regen the bundle.
 */
export const ARMOR_PIECES: ArmorPiece[] = sidekickModels().map((m) => ({
	id: m.ref,
	slots: m.nodes,
	slotKeys: m.slot_keys,
	set: m.set,
	covers: m.covers,
}));

export const PIECE_BY_ID = new Map(ARMOR_PIECES.map((p) => [p.id, p]));

export function pieceLabel(id: string): string {
	return itemLabel(id);
}

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

// One piece per body location: equipping into occupied locations takes every
// overlapping occupant off first (they fall back into the grid via
// reconcileArmor).
function evictSlotKeys(keys: string[]) {
	for (const id of [...equipped]) {
		const p = PIECE_BY_ID.get(id);
		if (p && p.slotKeys.some((k) => keys.includes(k))) equipped.delete(id);
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
		evictSlotKeys(piece.slotKeys);
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

/** Sum of an itemdb bonus stat over the equipped pieces — combat reads gear
 *  from here (armor, weight, …). */
export function equippedStat(key: string, set: Set<string> = equipped): number {
	let total = 0;
	for (const id of set) total += itemStat(id, key);
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
	for (const key of p.slotKeys) {
		const base = BASE_COVERED_BY_KEY.get(key);
		if (base && base !== 'HAIR' && !PIECE_BY_SKIN.has(base))
			PIECE_BY_SKIN.set(base, p.id);
	}
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
			for (const s of p.slots) {
				if (!BODY_BASE.has(s)) hidden.add(s);
			}
		} else {
			for (const key of p.slotKeys) {
				const base = BASE_COVERED_BY_KEY.get(key);
				if (base) hidden.add(base);
			}
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
