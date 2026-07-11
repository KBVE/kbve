import { useSyncExternalStore } from 'react';

export interface ArmorPiece {
	id: string;
	label: string;
	/** SIDEKICK slot-mesh names this piece owns (hidden together when removed). */
	slots: string[];
}

/**
 * The knight is a removable layer over a permanent skin base. `SKIN_*` body
 * meshes + the head/face group are always visible; every knight slot below is
 * toggleable. Removing all pieces leaves the naked base in its underwear.
 * Toggling a piece off hides its slot meshes; the rig and clips are untouched.
 */
export const ARMOR_PIECES: ArmorPiece[] = [
	{ id: 'helmet', label: 'Helmet', slots: ['AHED', 'AFAC'] },
	{ id: 'chest', label: 'Chestplate', slots: ['TORS'] },
	{ id: 'backpack', label: 'Backpack', slots: ['ABAC'] },
	{ id: 'pauldrons', label: 'Pauldrons', slots: ['ASHL', 'ASHR'] },
	{ id: 'upperArms', label: 'Upper Arms', slots: ['AUPL', 'AUPR'] },
	{ id: 'elbowGuards', label: 'Elbow Guards', slots: ['AEBL', 'AEBR'] },
	{ id: 'bracers', label: 'Bracers', slots: ['ALWL', 'ALWR'] },
	{ id: 'gauntlets', label: 'Gauntlets', slots: ['HNDL', 'HNDR'] },
	{
		id: 'faulds',
		label: 'Faulds',
		slots: ['HIPS', 'AHPF', 'AHPB', 'AHPL', 'AHPR'],
	},
	{ id: 'legs', label: 'Leg Armor', slots: ['LEGL', 'LEGR'] },
	{ id: 'kneeGuards', label: 'Knee Guards', slots: ['AKNL', 'AKNR'] },
	{ id: 'boots', label: 'Boots', slots: ['FOTL', 'FOTR'] },
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
			for (const s of SLOT_BY_PIECE.get(p.id)!) hidden.add(s);
		}
	}
	return hidden;
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

export function useEquippedArmor() {
	return useSyncExternalStore(subscribe, getEquipped, getEquipped);
}
