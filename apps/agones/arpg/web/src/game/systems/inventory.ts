import Phaser from 'phaser';
import {
	GameClient,
	EntityStore,
	ACTION_PICKUP,
	Cat,
	type KindEntry,
	type InventoryItem,
} from '@kbve/laser';
import { DEPTH_UI } from '../config';
import { worldToScreen, type TileXY } from '../iso';
import { DungeonField } from './dungeon';
import type { KindResolvers } from './kindResolvers';
import { makeSprite, type EntityRefs } from '../entities/sprites';
import { makeEnvSprite } from '../entities/env';
import { placeSprite } from './entityView';
import { emitInventory, emitInventoryOpen, type InventoryIntent } from './hud';

// Deployable inventory items → the env object they place. Mirrors the server's
// game::deployables() table so online + offline placement render the same thing.
const DEPLOYABLES: ReadonlyMap<string, string> = new Map([
	['campfire-kit', 'campfire'],
]);
// How far (Chebyshev) from the player a deployable may be placed. Mirrors the
// server's PLACE_RANGE so the client ghost reads valid exactly when the server
// would accept the placement.
export const PLACE_RANGE = 4;
// Offline kinds + eid ranges, kept disjoint from loot and the server's entities.
const LOCAL_ITEM_KIND = 2;
export const LOCAL_ITEM_EID_BASE = 1000;
const LOCAL_ENV_KIND = 3;
const LOCAL_ENV_EID_BASE = 5000;
// Offline dropped items get eids well above the seeded-loot range to avoid
// colliding with LOCAL_LOOT (LOCAL_ITEM_EID_BASE + index).
const LOCAL_DROP_EID_OFFSET = 1000;
// After a drop, suppress walk-over auto-pickup briefly so the item doesn't
// bounce straight back into the inventory.
const DROP_PICKUP_GRACE_MS = 1200;
const LOCAL_HEAL: ReadonlyMap<string, number> = new Map([['potion', 15]]);
// Per-item pickup resend cooldown: the client predicts ahead of the server, so
// an early walk-over pickup can land before the server sees us adjacent and is
// rejected; we retry on this cadence until the pickup despawns the item.
const PICKUP_RESEND_MS = 300;

/**
 * Inventory + placement + offline-loot state. The HUD panel is presentational;
 * every mutation routes through this module so online (server-authoritative)
 * and offline (client-sim) share one code path.
 */
export interface InventoryState {
	// Latest server-authoritative inventory (from EPHEMERAL_INVENTORY online).
	items: InventoryItem[];
	// Full inventory panel open state (toggled with I).
	open: boolean;
	// Per-item resend cooldown (server eid -> next scene-time a pickup may fire).
	pickupCooldown: Map<number, number>;
	// Scene-time (ms) until which walk-over auto-pickup is suspended after a drop.
	pickupSuspendUntil: number;
	// Offline-only ground loot (eid -> ref/count/tile). Empty online.
	localItems: Map<number, { ref: string; count: number; tile: TileXY }>;
	localDropSeq: number;
	// Active deployable placement: the item ref being placed + a translucent
	// ghost tracking the cursor. Null when not placing.
	placingRef: string | null;
	placeGhost: Phaser.GameObjects.Sprite | null;
	localEnvSeq: number;
}

export function makeInventoryState(): InventoryState {
	return {
		items: [],
		open: false,
		pickupCooldown: new Map(),
		pickupSuspendUntil: 0,
		localItems: new Map(),
		localDropSeq: 0,
		placingRef: null,
		placeGhost: null,
		localEnvSeq: 0,
	};
}

export interface InventoryDeps {
	scene: Phaser.Scene;
	store: EntityStore<EntityRefs>;
	kinds: KindResolvers;
	kindRegistry: Map<number, KindEntry>;
	client(): GameClient | null;
	myEid(): number;
	localMode(): boolean;
	floatTilePos(): TileXY;
	dungeon(): DungeonField;
	isBlocked(x: number, y: number): boolean;
	// Hide the move-hover diamond when placement mode arms.
	onPlacementArmed(): void;
}

/** Replace the inventory (server sync or offline mutation) and refresh the HUD. */
export function setInventory(st: InventoryState, items: InventoryItem[]): void {
	st.items = items;
	emitInventory(items);
}

/**
 * Use the item in slot `idx` (0-based), bound to keys 1-9. Deployables arm
 * placement mode instead of consuming. Online the server consumes + applies the
 * effect; offline the heal + consume happen client-side.
 */
export function useInventorySlot(
	st: InventoryState,
	deps: InventoryDeps,
	idx: number,
): void {
	const item = st.items[idx];
	if (!item) return;
	if (DEPLOYABLES.has(item.ref)) {
		enterPlacement(st, deps, item.ref);
		return;
	}
	const client = deps.client();
	if (client) {
		client.useItem(item.ref);
		return;
	}
	if (!deps.localMode()) return;
	const heal = LOCAL_HEAL.get(item.ref) ?? 0;
	if (heal > 0) {
		const eid = deps.myEid();
		const hp = Math.min(deps.store.maxHp(eid), deps.store.hp(eid) + heal);
		deps.store.update(eid, { hp });
	}
	const left = item.count - 1;
	setInventory(
		st,
		left <= 0
			? st.items.filter((_, i) => i !== idx)
			: st.items.map((s, i) => (i === idx ? { ...s, count: left } : s)),
	);
}

// HUD drag-and-drop dispatch: use a slot, drop it to the floor, or reorder.
export function handleInventoryIntent(
	st: InventoryState,
	deps: InventoryDeps,
	intent: InventoryIntent,
): void {
	switch (intent.type) {
		case 'use':
			useInventorySlot(st, deps, intent.index);
			break;
		case 'drop':
			dropInventorySlot(st, deps, intent.index);
			break;
		case 'reorder':
			reorderInventory(st, deps, intent.from, intent.to);
			break;
	}
}

/**
 * Move slot `from` to index `to`, shifting the rest. Online sends MoveItem and
 * applies the same splice optimistically; offline the splice is authoritative.
 */
export function reorderInventory(
	st: InventoryState,
	deps: InventoryDeps,
	from: number,
	to: number,
): void {
	const n = st.items.length;
	if (from < 0 || from >= n || to < 0 || to >= n || from === to) return;
	deps.client()?.moveItem(from, to);
	const next = st.items.slice();
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	setInventory(st, next);
}

/**
 * Drop the whole stack in slot `idx` to the floor at the player's tile. The
 * brief pickup-suspend stops walk-over auto-pickup from instantly grabbing it
 * back (both online and offline share the same auto-pickup loop).
 */
export function dropInventorySlot(
	st: InventoryState,
	deps: InventoryDeps,
	idx: number,
): void {
	const item = st.items[idx];
	if (!item) return;
	st.pickupSuspendUntil = deps.scene.time.now + DROP_PICKUP_GRACE_MS;
	const client = deps.client();
	if (client) {
		client.dropItem(item.ref, item.count);
		setInventory(
			st,
			st.items.filter((_, i) => i !== idx),
		);
		return;
	}
	if (!deps.localMode()) return;
	const me = deps.floatTilePos();
	const tile = deps.dungeon().nearestFloor({ x: me.x, y: me.y });
	const eid = LOCAL_ITEM_EID_BASE + LOCAL_DROP_EID_OFFSET + st.localDropSeq++;
	spawnLocalItem(st, deps, eid, item.ref, item.count, tile);
	setInventory(
		st,
		st.items.filter((_, i) => i !== idx),
	);
}

/**
 * Walk-over pickup: any ground item within one tile is grabbed automatically.
 * Online the server validates proximity + despawns; the per-item cooldown
 * throttles resends. Offline the pickup is applied directly.
 */
export function tryAutoPickup(st: InventoryState, deps: InventoryDeps): void {
	const now = deps.scene.time.now;
	if (now < st.pickupSuspendUntil) return;
	const me = deps.floatTilePos();
	const client = deps.client();
	if (client) {
		for (const sid of deps.store.serverIdsWith(Cat.Item)) {
			if (now < (st.pickupCooldown.get(sid) ?? 0)) continue;
			const t = deps.store.tile(sid);
			if (!t) continue;
			if (Math.max(Math.abs(t.x - me.x), Math.abs(t.y - me.y)) <= 1) {
				client.action(ACTION_PICKUP, sid);
				st.pickupCooldown.set(sid, now + PICKUP_RESEND_MS);
			}
		}
		return;
	}
	if (!deps.localMode()) return;
	for (const [eid, item] of st.localItems) {
		const d = Math.max(
			Math.abs(item.tile.x - me.x),
			Math.abs(item.tile.y - me.y),
		);
		if (d <= 1) localPickup(st, deps, eid, item);
	}
}

/** Offline: grab a local ground item into the inventory + remove its sprite. */
export function localPickup(
	st: InventoryState,
	deps: InventoryDeps,
	eid: number,
	item: { ref: string; count: number; tile: TileXY },
): void {
	const refs = deps.store.despawn(eid);
	if (refs) {
		deps.scene.tweens.killTweensOf(refs.sprite);
		refs.sprite.destroy();
	}
	st.localItems.delete(eid);
	const has = st.items.some((s) => s.ref === item.ref);
	setInventory(
		st,
		has
			? st.items.map((s) =>
					s.ref === item.ref
						? { ...s, count: s.count + item.count }
						: s,
				)
			: [...st.items, { ref: item.ref, count: item.count }],
	);
}

/**
 * Arm placement mode for a deployable item: spawn a translucent ghost of the env
 * it places that tracks the cursor, tinted for valid/invalid. A second arm of
 * the same ref toggles it off.
 */
export function enterPlacement(
	st: InventoryState,
	deps: InventoryDeps,
	itemRef: string,
): void {
	if (st.placingRef === itemRef) {
		exitPlacement(st);
		return;
	}
	const envRef = DEPLOYABLES.get(itemRef);
	if (!envRef) return;
	exitPlacement(st);
	st.placingRef = itemRef;
	const ghost = makeEnvSprite(deps.scene, envRef);
	if (ghost) {
		ghost.setAlpha(0.55);
		ghost.setDepth(DEPTH_UI);
		st.placeGhost = ghost;
	}
	deps.onPlacementArmed();
}

export function exitPlacement(st: InventoryState): void {
	st.placingRef = null;
	st.placeGhost?.destroy();
	st.placeGhost = null;
}

/**
 * A placement target is valid when it's a free floor tile within reach of the
 * player and not already occupied. Mirrors the server's place_item checks.
 */
export function canPlaceAt(
	st: InventoryState,
	deps: InventoryDeps,
	tile: TileXY,
): boolean {
	if (deps.isBlocked(tile.x, tile.y)) return false;
	if (deps.store.at(tile.x, tile.y, deps.myEid())) return false;
	const me = deps.floatTilePos();
	const cheb = Math.max(Math.abs(tile.x - me.x), Math.abs(tile.y - me.y));
	return cheb <= PLACE_RANGE;
}

/** Move the ghost to a tile and tint it by validity. */
export function updatePlaceGhost(
	st: InventoryState,
	deps: InventoryDeps,
	tile: TileXY,
): void {
	const ghost = st.placeGhost;
	if (!ghost) return;
	const p = worldToScreen(tile.x, tile.y);
	ghost.setPosition(p.x, p.y + 8);
	ghost.setDepth(DEPTH_UI);
	ghost.setTint(canPlaceAt(st, deps, tile) ? 0x86efac : 0xf87171);
}

/**
 * Commit the armed placement at a tile: server-authoritative online (the
 * campfire appears via the snapshot env path; a reject keeps the item),
 * client-spawned offline.
 */
export function commitPlacement(
	st: InventoryState,
	deps: InventoryDeps,
	tile: TileXY,
): void {
	const itemRef = st.placingRef;
	if (!itemRef) return;
	if (!canPlaceAt(st, deps, tile)) return;
	const idx = st.items.findIndex((s) => s.ref === itemRef);
	if (idx < 0) return;

	const client = deps.client();
	if (client) {
		client.placeItem(itemRef, tile);
		exitPlacement(st);
		return;
	}
	if (!deps.localMode()) {
		exitPlacement(st);
		return;
	}
	const envRef = DEPLOYABLES.get(itemRef);
	if (envRef) spawnLocalEnv(st, deps, envRef, tile);
	const item = st.items[idx];
	const left = item.count - 1;
	setInventory(
		st,
		left <= 0
			? st.items.filter((_, i) => i !== idx)
			: st.items.map((s, i) => (i === idx ? { ...s, count: left } : s)),
	);
	exitPlacement(st);
}

/**
 * Offline-only: spawn a placed env object as a real entity + block its tile,
 * mirroring the server's apply_placements so the campfire reads the same.
 */
export function spawnLocalEnv(
	st: InventoryState,
	deps: InventoryDeps,
	envRef: string,
	tile: TileXY,
): void {
	const kind = LOCAL_ENV_KIND;
	if (!deps.kindRegistry.has(kind)) {
		deps.kindRegistry.set(kind, { kind, ref: envRef, cat: Cat.Env });
	}
	const eid = LOCAL_ENV_EID_BASE + st.localEnvSeq++;
	const sprite =
		makeEnvSprite(deps.scene, envRef) ??
		makeSprite(deps.scene, deps.kinds, kind, false);
	placeSprite(deps.scene, sprite, tile.x, tile.y);
	deps.store.spawn(
		eid,
		{ tile, kind, cat: Cat.Env, owner: 0, hostile: false, hp: 0, maxHp: 0 },
		{ sprite },
	);
}

/** Offline only: render a floating ground-loot sprite tracked in localItems. */
export function spawnLocalItem(
	st: InventoryState,
	deps: InventoryDeps,
	eid: number,
	ref: string,
	count: number,
	tile: TileXY,
): void {
	if (!deps.kindRegistry.has(LOCAL_ITEM_KIND)) {
		deps.kindRegistry.set(LOCAL_ITEM_KIND, {
			kind: LOCAL_ITEM_KIND,
			ref,
			cat: Cat.Item,
		});
	}
	const sprite = makeSprite(deps.scene, deps.kinds, LOCAL_ITEM_KIND, false);
	placeSprite(deps.scene, sprite, tile.x, tile.y);
	deps.scene.tweens.add({
		targets: sprite,
		y: sprite.y - 6,
		duration: 650,
		yoyo: true,
		repeat: -1,
		ease: 'Sine.easeInOut',
	});
	deps.store.spawn(
		eid,
		{
			tile,
			kind: LOCAL_ITEM_KIND,
			cat: Cat.Item,
			owner: 0,
			hostile: false,
			hp: 0,
			maxHp: 0,
		},
		{ sprite },
	);
	st.localItems.set(eid, { ref, count, tile });
}
