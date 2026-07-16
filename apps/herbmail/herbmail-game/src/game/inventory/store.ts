import { useSyncExternalStore } from 'react';
import {
	autoSort,
	canPlace,
	firstFit,
	rotate,
	type Placement,
	type Rect,
	type Rot,
} from './grid';
import { ARMOR_ITEM_IDS, isArmorItem, itemDef } from './items';
import { getHeld, setEquipped, subscribeHeld } from '../viewmodel/store';
import { slotOf, type HandSlot } from '../viewmodel/equipment';
import {
	PIECE_BY_ID,
	getEquipped,
	setAllArmor,
	setArmor,
	subscribeArmor,
} from '../character/armor';

export interface PlacedItem {
	uid: number;
	itemId: string;
	x: number;
	y: number;
	rot: Rot;
}

let items: PlacedItem[] = [];
let open = false;
let nextUid = 1;
const listeners = new Set<() => void>();

function emit() {
	for (const l of listeners) l();
}

// Resolve a placed item to its rotation-applied grid rect. Unknown ids collapse to
// a 1x1 so a bad drop can never break packing.
export function rectOf(p: PlacedItem): Rect {
	const def = itemDef(p.itemId);
	const fp = rotate(def ? def.fp : { w: 1, h: 1 }, p.rot);
	return { uid: p.uid, x: p.x, y: p.y, w: fp.w, h: fp.h };
}

function rects(): Rect[] {
	return items.map(rectOf);
}

// Drop a loot item into the first free fit (upright, then rotated). Returns false
// when nothing fits — caller keeps the drop in the world.
export function addLoot(id: string): boolean {
	const def = itemDef(id);
	if (!def) return false;
	const placed = rects();
	for (const rot of [0, 1] as Rot[]) {
		const { w, h } = rotate(def.fp, rot);
		const spot = firstFit(placed, w, h);
		if (spot) {
			items = [
				...items,
				{ uid: nextUid++, itemId: id, x: spot.x, y: spot.y, rot },
			];
			emit();
			return true;
		}
	}
	return false;
}

// Move (and optionally rotate) an item to (x,y). No-op if it would not fit.
export function move(uid: number, x: number, y: number, rot: Rot): boolean {
	const def = items.find((p) => p.uid === uid);
	if (!def) return false;
	const d = itemDef(def.itemId);
	const { w, h } = rotate(d ? d.fp : { w: 1, h: 1 }, rot);
	if (!canPlace(rects(), x, y, w, h, uid)) return false;
	items = items.map((p) => (p.uid === uid ? { ...p, x, y, rot } : p));
	emit();
	return true;
}

export function removeItem(uid: number): void {
	items = items.filter((p) => p.uid !== uid);
	emit();
}

export function sortInventory(): void {
	const placements: Placement[] = autoSort(
		items.map((p) => {
			const d = itemDef(p.itemId);
			return { uid: p.uid, fp: d ? d.fp : { w: 1, h: 1 } };
		}),
	);
	const byUid = new Map(placements.map((pl) => [pl.uid, pl]));
	items = items.map((p) => {
		const pl = byUid.get(p.uid);
		return pl ? { ...p, x: pl.x, y: pl.y, rot: pl.rot } : p;
	});
	emit();
}

export function toggleOpen(): boolean {
	open = !open;
	emit();
	return open;
}

export function isOpen(): boolean {
	return open;
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

export function getItems() {
	return items;
}

export function useInventory(): PlacedItem[] {
	return useSyncExternalStore(subscribe, getItems, getItems);
}

export function useInventoryOpen(): boolean {
	return useSyncExternalStore(subscribe, isOpen, isOpen);
}

// Equippables the player owns. The grid always holds each of these EXCEPT the ones
// currently in-hand: equipping pulls an item out, taking it off puts it back.
const OWNED_EQUIP = ['sword', 'torch', 'crate'];

// Reconcile grid contents against the current hands: remove owned equippables that
// are now held, re-add ones that are no longer held (at the first free fit).
export function reconcileEquip(heldIds: string[]): void {
	let changed = false;
	for (const id of OWNED_EQUIP) {
		const held = heldIds.includes(id);
		const present = items.some((p) => p.itemId === id);
		if (held && present) {
			items = items.filter((p) => p.itemId !== id);
			changed = true;
		} else if (!held && !present) {
			const def = itemDef(id);
			if (!def) continue;
			for (const rot of [0, 1] as Rot[]) {
				const { w, h } = rotate(def.fp, rot);
				const spot = firstFit(rects(), w, h);
				if (spot) {
					items = [
						...items,
						{
							uid: nextUid++,
							itemId: id,
							x: spot.x,
							y: spot.y,
							rot,
						},
					];
					changed = true;
					break;
				}
			}
		}
	}
	if (changed) emit();
}

// Reconcile grid contents against equipped armor: a piece worn on the paperdoll
// leaves the grid; taking it off drops it back at the first free fit. itemId,
// equipId and the armor-piece id are all the same string.
export function reconcileArmor(equippedIds: Set<string>): void {
	let changed = false;
	for (const id of ARMOR_ITEM_IDS) {
		const worn = equippedIds.has(id);
		const present = items.some((p) => p.itemId === id);
		if (worn && present) {
			items = items.filter((p) => p.itemId !== id);
			changed = true;
		} else if (!worn && !present) {
			const def = itemDef(id);
			if (!def) continue;
			for (const rot of [0, 1] as Rot[]) {
				const { w, h } = rotate(def.fp, rot);
				const spot = firstFit(rects(), w, h);
				if (spot) {
					items = [
						...items,
						{
							uid: nextUid++,
							itemId: id,
							x: spot.x,
							y: spot.y,
							rot,
						},
					];
					changed = true;
					break;
				}
			}
		}
	}
	if (changed) emit();
}

export function autoEquip(): void {
	const taken = new Set<HandSlot>();
	for (const id of getHeld()) {
		const s = slotOf(id);
		if (s) taken.add(s);
	}
	// One piece per body location: first grid item wins its slotKey, later ones
	// stay in the grid instead of evicting what auto-equip just put on.
	const wornKeys = new Set<string>();
	for (const id of getEquipped()) {
		const piece = PIECE_BY_ID.get(id);
		for (const k of piece?.slotKeys ?? []) wornKeys.add(k);
	}
	for (const p of [...items]) {
		if (isArmorItem(p.itemId)) {
			const piece = PIECE_BY_ID.get(p.itemId);
			if (piece && !piece.slotKeys.some((k) => wornKeys.has(k))) {
				for (const k of piece.slotKeys) wornKeys.add(k);
				setArmor(p.itemId, true);
			}
			continue;
		}
		const def = itemDef(p.itemId);
		if (!def?.equipId) continue;
		const slot = slotOf(def.equipId);
		if (!slot || taken.has(slot)) continue;
		taken.add(slot);
		setEquipped(def.equipId);
	}
}

// Seed the grid with every owned equippable (nothing held at boot).
reconcileEquip([]);
subscribeHeld(() => reconcileEquip(getHeld()));

// Armor starts unequipped: every piece sits in the grid, the player gears up by
// equipping onto the paperdoll. The bare skin + underwear base (SKIN_* meshes)
// shows through, so stripping everything leaves the underwear-clad body.
setAllArmor(false);
reconcileArmor(getEquipped());
subscribeArmor(() => reconcileArmor(getEquipped()));
