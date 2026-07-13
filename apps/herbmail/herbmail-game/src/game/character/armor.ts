import { useSyncExternalStore } from 'react';

export interface ArmorPiece {
	id: string;
	label: string;
	/** SIDEKICK slot-mesh names this piece owns (hidden together when removed). */
	slots: string[];
}

// The naked body: these meshes ARE the character, not armor, and stay visible no
// matter what is unequipped. This GLB ships no separate skin base — the torso,
// limbs, hands, feet and face below are the only body geometry — so an armor piece
// must never own one, or removing it deletes the body and leaves a floating head.
export const BODY_BASE = new Set([
	'TORS',
	'LEGL',
	'LEGR',
	'HIPS',
	'HNDL',
	'HNDR',
	'FOTL',
	'FOTR',
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
	// Arm skin. The knight outfit ships no arm under-layer, so the human-species
	// arm (SIDEKICK slots 11AUPL/12AUPR/13ALWL/14ALWR) is baked in as the base and
	// renamed to these S* nodes — the raw tokens collide with the knight armor
	// (AUP*/ALW*), so the skin must carry a distinct name to survive armor hiding.
	'SUPL',
	'SUPR',
	'SLWL',
	'SLWR',
]);

/**
 * Removable knight armor layered over the permanent {@link BODY_BASE}. Every slot
 * here is an `A`-prefixed overlay mesh; toggling a piece off hides only its plates
 * (the rig and clips are untouched) and reveals the body beneath. Pieces with no
 * dedicated armor mesh in this GLB (chest, legs, gauntlets, boots) are omitted —
 * there is nothing to toggle for them.
 */
export const ARMOR_PIECES: ArmorPiece[] = [
	{ id: 'helmet', label: 'Helmet', slots: ['AHED'] },
	{ id: 'eyePatch', label: 'Eye Patch', slots: ['AFAC'] },
	{ id: 'backpack', label: 'Backpack', slots: ['ABAC'] },
	{ id: 'pauldronL', label: 'Pauldron (L)', slots: ['ASHL'] },
	{ id: 'pauldronR', label: 'Pauldron (R)', slots: ['ASHR'] },
	{ id: 'upperArmL', label: 'Upper Arm (L)', slots: ['AUPL'] },
	{ id: 'upperArmR', label: 'Upper Arm (R)', slots: ['AUPR'] },
	{ id: 'elbowL', label: 'Elbow Guard (L)', slots: ['AEBL'] },
	{ id: 'elbowR', label: 'Elbow Guard (R)', slots: ['AEBR'] },
	{ id: 'bracerL', label: 'Bracer (L)', slots: ['ALWL'] },
	{ id: 'bracerR', label: 'Bracer (R)', slots: ['ALWR'] },
	{ id: 'fauldFront', label: 'Fauld (Front)', slots: ['AHPF'] },
	{ id: 'fauldBack', label: 'Fauld (Back)', slots: ['AHPB'] },
	{ id: 'fauldLeft', label: 'Fauld (Left)', slots: ['AHPL'] },
	{ id: 'fauldRight', label: 'Fauld (Right)', slots: ['AHPR'] },
	{ id: 'kneeL', label: 'Knee Guard (L)', slots: ['AKNL'] },
	{ id: 'kneeR', label: 'Knee Guard (R)', slots: ['AKNR'] },
];

const SLOT_BY_PIECE = new Map(ARMOR_PIECES.map((p) => [p.id, p.slots]));

let equipped = new Set(ARMOR_PIECES.map((p) => p.id));
const listeners = new Set<() => void>();

function emit() {
	equipped = new Set(equipped);
	for (const l of listeners) l();
}

export function toggleArmor(id: string) {
	if (equipped.has(id)) equipped.delete(id);
	else equipped.add(id);
	emit();
}

export function setArmor(id: string, on: boolean) {
	if (on === equipped.has(id)) return;
	if (on) equipped.add(id);
	else equipped.delete(id);
	emit();
}

export function setAllArmor(on: boolean) {
	equipped = on ? new Set(ARMOR_PIECES.map((p) => p.id)) : new Set();
	for (const l of listeners) l();
}

export function getEquipped() {
	return equipped;
}

/** Slot-mesh names currently hidden (owned by un-equipped pieces). */
export function hiddenSlots(): Set<string> {
	const hidden = new Set<string>();
	for (const p of ARMOR_PIECES) {
		if (!equipped.has(p.id)) {
			for (const s of SLOT_BY_PIECE.get(p.id)!) {
				if (!BODY_BASE.has(s)) hidden.add(s);
			}
		}
	}
	return hidden;
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
