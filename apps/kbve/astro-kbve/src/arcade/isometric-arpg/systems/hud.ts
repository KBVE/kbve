import { laserEvents, type InventoryItem } from '@kbve/laser';

export const HUD_EVENT = 'arpg:hud';

export interface HudState {
	name: string;
	hp: number;
	maxHp: number;
	headingDeg: number;
	moving: boolean;
	fps: number;
	tile: { x: number; y: number };
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

export const HUD_CLEAR_EVENT = 'arpg:hud:clear';

export function clearHud(): void {
	laserEvents.emit(HUD_CLEAR_EVENT, undefined);
}

export function onHudClear(handler: () => void): () => void {
	return laserEvents.on(HUD_CLEAR_EVENT, handler as (data: unknown) => void);
}
