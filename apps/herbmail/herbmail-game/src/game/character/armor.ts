import { useSyncExternalStore } from 'react';

export interface ArmorPiece {
	id: string;
	label: string;
	/** SIDEKICK slot-mesh names this piece owns (hidden together when removed). */
	slots: string[];
}

/**
 * Equipment pieces = SIDEKICK `A*` attachment meshes, grouped into logical
 * items. Every other mesh (body, head, hair, hands, feet) is always visible.
 * Toggling a piece off hides its slot meshes; the rig and clips are untouched.
 */
export const ARMOR_PIECES: ArmorPiece[] = [
	{ id: 'helmet', label: 'Helmet', slots: ['AHED', 'AFAC'] },
	{ id: 'backpack', label: 'Backpack', slots: ['ABAC'] },
	{ id: 'pauldrons', label: 'Pauldrons', slots: ['ASHL', 'ASHR'] },
	{
		id: 'hipGuards',
		label: 'Hip Guards',
		slots: ['AHPF', 'AHPB', 'AHPL', 'AHPR'],
	},
	{ id: 'elbowGuards', label: 'Elbow Guards', slots: ['AEBL', 'AEBR'] },
	{ id: 'kneeGuards', label: 'Knee Guards', slots: ['AKNL', 'AKNR'] },
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
