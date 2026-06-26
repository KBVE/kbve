import Phaser from 'phaser';
import { GameClient, EntityStore, Cat } from '@kbve/laser';
import {
	worldToScreen,
	screenToWorld,
	screenToWorldF,
	type TileXY,
} from '../iso';
import { CursorController, Cursor } from './cursor';
import { isTextInputFocused } from './devices/keyboard';
import type { KindResolvers } from '../systems/kindResolvers';
import type { EntityRefs } from '../entities/sprites';
import type { InventoryState } from '../systems/inventory';
import type { MovementState } from '../systems/movement';
import { PLACE_RANGE } from '../systems/inventory';
import { emitInventoryOpen, onInventoryOpen } from '../systems/hud';

/**
 * Everything the scene's input bindings dispatch into. Input is the hub that
 * turns raw keyboard/pointer events into system calls; this keeps that wiring
 * out of the scene while leaving the systems themselves untouched.
 */
export interface SceneInputDeps {
	store: EntityStore<EntityRefs>;
	kinds: KindResolvers;
	inv: InventoryState;
	move: MovementState;
	hoverTile: Phaser.GameObjects.Graphics;
	client(): GameClient | null;
	myEid(): number;
	mySlot(): number;
	isBlocked(x: number, y: number): boolean;
	isHostile(serverEid: number): boolean;
	useInventorySlot(idx: number): void;
	castSpellSlot(idx: number): void;
	exitPlacement(): void;
	rotatePlacement(): void;
	commitPlacement(tile: TileXY): void;
	updatePlaceGhost(tile: TileXY): void;
	fireBowAt(aim: TileXY, target?: number): void;
	startMoveTo(tile: TileXY): void;
}

export interface SceneInputRefs {
	cursors: Phaser.Types.Input.Keyboard.CursorKeys;
	wasd: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
	fireKey: Phaser.Input.Keyboard.Key;
	cursor: CursorController;
}

export function setupInput(
	scene: Phaser.Scene,
	deps: SceneInputDeps,
): SceneInputRefs {
	const kb = scene.input.keyboard!;
	const cursors = kb.createCursorKeys();
	const wasd = {
		up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
		down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
		left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
		right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
	};
	const fireKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

	// 1-9 cast the matching spell slot; Shift+1-9 use the matching inventory
	// slot. Read ev.code (Digit1..Digit9), not ev.key: holding Shift rewrites
	// ev.key to '!@#$%^&*(' on US layouts, but the code stays Digit-N.
	// I toggles the full inventory panel; Escape closes it.
	kb.on('keydown', (ev: KeyboardEvent) => {
		// Chat (or any text field) owns the keyboard — don't fire hotbar/toggles.
		if (isTextInputFocused()) return;
		const digit = /^Digit([1-9])$/.exec(ev.code);
		if (digit) {
			const idx = Number(digit[1]) - 1;
			if (ev.shiftKey) deps.useInventorySlot(idx);
			else deps.castSpellSlot(idx);
		} else if (ev.key === 'i' || ev.key === 'I') {
			deps.inv.open = !deps.inv.open;
			emitInventoryOpen(deps.inv.open);
		} else if (ev.key === 'r' || ev.key === 'R') {
			if (deps.inv.placingRef) {
				ev.preventDefault();
				deps.rotatePlacement();
			}
		} else if (ev.key === 'Escape') {
			if (deps.inv.placingRef) {
				deps.exitPlacement();
			} else if (deps.inv.open) {
				deps.inv.open = false;
				emitInventoryOpen(false);
			}
		}
	});

	// Keep scene-side open state in sync when the panel is closed from the UI
	// (gothic ✕), so the next `I` press toggles from the real state.
	onInventoryOpen((o) => {
		deps.inv.open = o;
	});

	scene.input.mouse?.disableContextMenu();

	const cursor = new CursorController(scene);
	cursor.set(Cursor.Pointer);

	scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
		cursor.set(Cursor.Hold);
		const aim = screenToWorldF(pointer.worldX, pointer.worldY);
		const tile = { x: Math.round(aim.x), y: Math.round(aim.y) };

		// Placement mode: left-click commits the deployable, right-click cancels.
		if (deps.inv.placingRef) {
			if (pointer.rightButtonDown()) deps.exitPlacement();
			else deps.commitPlacement(tile);
			return;
		}

		// Right button = fire the bow at the cursor (left = move/attack).
		if (pointer.rightButtonDown()) {
			deps.fireBowAt(aim);
			return;
		}

		// Reclaim an owned placed object (campfire). Checked before isBlocked
		// since the object occupies — and therefore blocks — its own tile.
		const owned = deps.store.at(tile.x, tile.y, deps.myEid());
		if (
			owned &&
			deps.kinds.cat(deps.store.kind(owned.serverEid)) === Cat.Env &&
			deps.store.owner(owned.serverEid) === deps.mySlot()
		) {
			const d = Math.max(
				Math.abs(deps.move.predicted.x - tile.x),
				Math.abs(deps.move.predicted.y - tile.y),
			);
			if (d <= PLACE_RANGE) deps.client()?.pickupObject(tile);
			return;
		}

		if (deps.isBlocked(tile.x, tile.y)) return;
		const hit = deps.store.at(tile.x, tile.y, deps.myEid());
		if (hit && deps.isHostile(hit.serverEid)) {
			// Fire at the clicked enemy. fireBowAt sends the single authoritative
			// attack (targeting THIS enemy) — no separate action() call, or the
			// server would see a double-fire.
			deps.move.movePath = [];
			deps.fireBowAt(aim, hit.serverEid);
			return;
		}
		deps.startMoveTo(tile);
	});

	scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
		updateCursorFor(
			deps,
			cursor,
			screenToWorld(pointer.worldX, pointer.worldY),
			false,
		);
	});

	scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
		const tile = screenToWorld(pointer.worldX, pointer.worldY);
		updateCursorFor(deps, cursor, tile, pointer.isDown);
		// Placement mode drives the ghost instead of the move-hover diamond.
		if (deps.inv.placingRef) {
			deps.hoverTile.setVisible(false);
			deps.updatePlaceGhost(tile);
			return;
		}
		if (deps.isBlocked(tile.x, tile.y)) {
			deps.hoverTile.setVisible(false);
			return;
		}
		const p = worldToScreen(tile.x, tile.y);
		deps.hoverTile.setPosition(p.x, p.y).setVisible(true);
	});

	return { cursors, wasd, fireKey, cursor };
}

// Hold while a button is down or placing; open hand (Take) over a pickup or
// NPC; pointing finger otherwise.
function updateCursorFor(
	deps: SceneInputDeps,
	cursor: CursorController,
	tile: TileXY,
	pointerDown: boolean,
): void {
	if (deps.inv.placingRef || pointerDown) {
		cursor.set(Cursor.Hold);
		return;
	}
	const hit = deps.store.at(tile.x, tile.y, deps.myEid());
	const cat = hit ? deps.kinds.cat(deps.store.kind(hit.serverEid)) : null;
	cursor.set(
		cat === Cat.Item || cat === Cat.Npc ? Cursor.Take : Cursor.Pointer,
	);
}
