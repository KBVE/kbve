import { laserEvents, type InventoryItem } from '@kbve/laser';

export const HUD_EVENT = 'arpg:hud';

/**
 * A square window of the dungeon around the player for the minimap. `cells` is
 * row-major, length `size*size`, 1 = floor (walkable path/room) else wall. The
 * window is centered so the player sits at the middle cell; `origin` is the
 * world tile of cell (0,0).
 */
export interface HudMap {
	origin: { x: number; y: number };
	size: number;
	cells: Uint8Array;
}

export interface HudState {
	name: string;
	hp: number;
	maxHp: number;
	mp: number;
	maxMp: number;
	ep: number;
	maxEp: number;
	sp: number;
	maxSp: number;
	headingDeg: number;
	moving: boolean;
	fps: number;
	tile: { x: number; y: number };
	map: HudMap;
}

export function emitHud(state: HudState): void {
	laserEvents.emit(HUD_EVENT, state);
}

export function onHud(handler: (state: HudState) => void): () => void {
	return laserEvents.on(HUD_EVENT, handler as (data: unknown) => void);
}

export const INVENTORY_EVENT = 'arpg:inventory';

export function emitInventory(items: InventoryItem[]): void {
	laserEvents.emit(INVENTORY_EVENT, items);
}

export function onInventory(
	handler: (items: InventoryItem[]) => void,
): () => void {
	return laserEvents.on(INVENTORY_EVENT, handler as (data: unknown) => void);
}

/** Player-driven inventory actions emitted by the HUD, handled by the scene
 * (which owns the authoritative client / offline sim). */
export type InventoryIntent =
	| { type: 'use'; index: number }
	| { type: 'drop'; index: number }
	| { type: 'reorder'; from: number; to: number };

export const INVENTORY_INTENT_EVENT = 'arpg:inventory:intent';

export function emitInventoryIntent(intent: InventoryIntent): void {
	laserEvents.emit(INVENTORY_INTENT_EVENT, intent);
}

export function onInventoryIntent(
	handler: (intent: InventoryIntent) => void,
): () => void {
	return laserEvents.on(
		INVENTORY_INTENT_EVENT,
		handler as (data: unknown) => void,
	);
}

/** A global HUD tooltip request. `null` hides it; otherwise anchor it at the
 * viewport point and render the lines. Driven by hover/touch on HUD widgets. */
export interface TooltipState {
	x: number;
	y: number;
	title: string;
	lines: string[];
}

export const TOOLTIP_EVENT = 'arpg:tooltip';

export function emitTooltip(state: TooltipState | null): void {
	laserEvents.emit(TOOLTIP_EVENT, state);
}

export function onTooltip(
	handler: (state: TooltipState | null) => void,
): () => void {
	return laserEvents.on(TOOLTIP_EVENT, handler as (data: unknown) => void);
}

export const INVENTORY_OPEN_EVENT = 'arpg:inventory:open';

export function emitInventoryOpen(open: boolean): void {
	laserEvents.emit(INVENTORY_OPEN_EVENT, open);
}

export function onInventoryOpen(handler: (open: boolean) => void): () => void {
	return laserEvents.on(
		INVENTORY_OPEN_EVENT,
		handler as (data: unknown) => void,
	);
}

export const HUD_CLEAR_EVENT = 'arpg:hud:clear';

export function clearHud(): void {
	laserEvents.emit(HUD_CLEAR_EVENT, undefined);
}

export function onHudClear(handler: () => void): () => void {
	return laserEvents.on(HUD_CLEAR_EVENT, handler as (data: unknown) => void);
}
