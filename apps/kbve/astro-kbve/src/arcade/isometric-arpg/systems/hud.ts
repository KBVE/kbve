import { laserEvents } from '@kbve/laser';

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

export const HUD_CLEAR_EVENT = 'arpg:hud:clear';

export function clearHud(): void {
	laserEvents.emit(HUD_CLEAR_EVENT, undefined);
}

export function onHudClear(handler: () => void): () => void {
	return laserEvents.on(HUD_CLEAR_EVENT, handler as (data: unknown) => void);
}
