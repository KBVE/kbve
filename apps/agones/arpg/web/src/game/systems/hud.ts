import {
	laserEvents,
	type InventoryItem,
	type NotificationEventData,
} from '@kbve/laser';
import type { SpellMeta } from '../entities/spellMeta';

// Boot/loading feedback while the scene preloads art, connects, and streams the
// first map window — so the player sees progress instead of a blank canvas
// between Discord approve and being in-world. `ready` tears the overlay down.
export type BootPhase =
	| 'assets'
	| 'connecting'
	| 'entering'
	| 'ready'
	| 'error';

export interface BootStatus {
	phase: BootPhase;
	message: string;
	/** 0..1 asset-load fraction, only during the `assets` phase. */
	progress?: number;
	/** Secondary line under the bar (file counts, current step). */
	detail?: string;
}

export const BOOT_EVENT = 'arpg:boot';

export function emitBoot(status: BootStatus): void {
	laserEvents.emit(BOOT_EVENT, status);
}

export function onBoot(handler: (status: BootStatus) => void): () => void {
	return laserEvents.on(BOOT_EVENT, handler as (data: unknown) => void);
}

// Post-boot connection health for the in-game banner (the boot overlay owns the
// pre-spawn phase). Drives a "reconnecting" / "disconnected" banner so a dropped
// socket reads as a clear state instead of a silently frozen world.
export interface ConnectionView {
	status: 'connected' | 'reconnecting' | 'closed';
	attempts: number;
	maxAttempts: number;
}

export const CONNECTION_EVENT = 'arpg:connection';

export function emitConnection(view: ConnectionView): void {
	laserEvents.emit(CONNECTION_EVENT, view);
}

export function onConnection(
	handler: (view: ConnectionView) => void,
): () => void {
	return laserEvents.on(CONNECTION_EVENT, handler as (data: unknown) => void);
}

// Count of players currently in the world (incl. self), from each snapshot — so
// the HUD can show "N online" and solo play reads as "you're alone", not broken.
export const PLAYERS_EVENT = 'arpg:players';

export function emitPlayers(count: number): void {
	laserEvents.emit(PLAYERS_EVENT, count);
}

export function onPlayers(handler: (count: number) => void): () => void {
	return laserEvents.on(PLAYERS_EVENT, handler as (data: unknown) => void);
}

// Objective guide: a bearing + distance to the nearest descent (down-stairs).
// The seed places the stair deterministically (server-authoritative), often off
// the spawn screen; this on-top hybrid layer just points the player at it
// without touching the seed/parity. `deg` is screen-space (0=N, CW), matching
// the compass. null hides the arrow (underground, or standing on the stair).
export interface GuideView {
	deg: number;
	dist: number;
}

export const GUIDE_EVENT = 'arpg:guide';

export function emitGuide(view: GuideView | null): void {
	laserEvents.emit(GUIDE_EVENT, view);
}

export function onGuide(handler: (view: GuideView | null) => void): () => void {
	return laserEvents.on(GUIDE_EVENT, handler as (data: unknown) => void);
}

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

export const SPELL_LOADOUT_EVENT = 'arpg:spells';

export function emitSpellLoadout(spells: SpellMeta[]): void {
	laserEvents.emit(SPELL_LOADOUT_EVENT, spells);
}

export function onSpellLoadout(
	handler: (spells: SpellMeta[]) => void,
): () => void {
	return laserEvents.on(
		SPELL_LOADOUT_EVENT,
		handler as (data: unknown) => void,
	);
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

// Chat <-> scene bridge. The scene polls the input router's ToggleChat action and
// emits CHAT_TOGGLE so the React ChatPanel opens/focuses; the panel emits
// CHAT_FOCUS back so the scene can push/pop the Chat input context (gates
// movement/combat while typing).
export const CHAT_TOGGLE_EVENT = 'arpg:chat:toggle';
export const CHAT_FOCUS_EVENT = 'arpg:chat:focus';

export function emitChatToggle(): void {
	laserEvents.emit(CHAT_TOGGLE_EVENT, undefined);
}

export function onChatToggle(handler: () => void): () => void {
	return laserEvents.on(CHAT_TOGGLE_EVENT, handler as (d: unknown) => void);
}

export function emitChatFocus(focused: boolean): void {
	laserEvents.emit(CHAT_FOCUS_EVENT, focused);
}

export function onChatFocus(handler: (focused: boolean) => void): () => void {
	return laserEvents.on(CHAT_FOCUS_EVENT, handler as (data: unknown) => void);
}

// Local player death → a brief "You Died" overlay. Death is instant + the server
// respawns next tick, so this fires off the broadcast combat event (died, target
// == self), not a sustained hp=0.
export const DEATH_EVENT = 'arpg:death';

export function emitDeath(): void {
	laserEvents.emit(DEATH_EVENT, undefined);
}

export function onDeath(handler: () => void): () => void {
	return laserEvents.on(DEATH_EVENT, handler as (data: unknown) => void);
}

export const HUD_CLEAR_EVENT = 'arpg:hud:clear';

export function clearHud(): void {
	laserEvents.emit(HUD_CLEAR_EVENT, undefined);
}

export function onHudClear(handler: () => void): () => void {
	return laserEvents.on(HUD_CLEAR_EVENT, handler as (data: unknown) => void);
}

// Transient on-screen toast — uses laser's native `notification` event so any
// system (stairs, pickups, level-up) can surface a message the HUD renders.
export function emitNotification(n: NotificationEventData): void {
	laserEvents.emit('notification', n);
}

export function onNotification(
	handler: (n: NotificationEventData) => void,
): () => void {
	return laserEvents.on('notification', handler as (data: unknown) => void);
}
