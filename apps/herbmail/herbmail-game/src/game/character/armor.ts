import { useSyncExternalStore } from 'react';

export interface ArmorPiece {
	id: string;
	label: string;
	/** SIDEKICK slot-mesh names this piece owns (hidden together when removed). */
	slots: string[];
}

// The naked body: the human-species skin (SKIN_* nodes baked in by
// attach_skin_body.py) plus 38WRAP underwear and the face. These ARE the
// character and stay visible no matter what is unequipped — every knight mesh is
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
 * Removable knight layer over the permanent {@link BODY_BASE}. Toggling a piece
 * off hides its meshes (rig and clips untouched) and reveals the bare skin +
 * underwear beneath. `A`-prefixed slots are the armor plates; the raw knight body
 * meshes (TORS/HIPS/LEGL·R/HNDL·R/FOTL·R) are the outfit's clothed torso, hips,
 * legs, hands and feet — now removable so stripping everything leaves the
 * underwear-clad body.
 */
export const ARMOR_PIECES: ArmorPiece[] = [
	{ id: 'helmet', label: 'Helmet', slots: ['AHED'] },
	{ id: 'eyePatch', label: 'Eye Patch', slots: ['AFAC'] },
	{ id: 'backpack', label: 'Backpack', slots: ['ABAC'] },
	{ id: 'chest', label: 'Chest', slots: ['TORS'] },
	{ id: 'pauldronL', label: 'Pauldron (L)', slots: ['ASHL'] },
	{ id: 'pauldronR', label: 'Pauldron (R)', slots: ['ASHR'] },
	{ id: 'upperArmL', label: 'Upper Arm (L)', slots: ['AUPL'] },
	{ id: 'upperArmR', label: 'Upper Arm (R)', slots: ['AUPR'] },
	{ id: 'elbowL', label: 'Elbow Guard (L)', slots: ['AEBL'] },
	{ id: 'elbowR', label: 'Elbow Guard (R)', slots: ['AEBR'] },
	{ id: 'bracerL', label: 'Bracer (L)', slots: ['ALWL'] },
	{ id: 'bracerR', label: 'Bracer (R)', slots: ['ALWR'] },
	{ id: 'gauntletL', label: 'Gauntlet (L)', slots: ['HNDL'] },
	{ id: 'gauntletR', label: 'Gauntlet (R)', slots: ['HNDR'] },
	{ id: 'hips', label: 'Hips', slots: ['HIPS'] },
	{ id: 'fauldFront', label: 'Fauld (Front)', slots: ['AHPF'] },
	{ id: 'fauldBack', label: 'Fauld (Back)', slots: ['AHPB'] },
	{ id: 'fauldLeft', label: 'Fauld (Left)', slots: ['AHPL'] },
	{ id: 'fauldRight', label: 'Fauld (Right)', slots: ['AHPR'] },
	{ id: 'legL', label: 'Leg (L)', slots: ['LEGL'] },
	{ id: 'legR', label: 'Leg (R)', slots: ['LEGR'] },
	{ id: 'kneeL', label: 'Knee Guard (L)', slots: ['AKNL'] },
	{ id: 'kneeR', label: 'Knee Guard (R)', slots: ['AKNR'] },
	{ id: 'bootL', label: 'Boot (L)', slots: ['FOTL'] },
	{ id: 'bootR', label: 'Boot (R)', slots: ['FOTR'] },
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
