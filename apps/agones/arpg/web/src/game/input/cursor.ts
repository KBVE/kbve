import Phaser from 'phaser';
import { arpgAsset, DEPTH_UI } from '../config';

export const Cursor = {
	Pointer: 0,
	Hold: 1,
	Take: 2,
} as const;

export type CursorState = (typeof Cursor)[keyof typeof Cursor];

interface CursorSpec {
	path: string;
	hotX: number;
	hotY: number;
}

const ART = 72; // glove sheets are 72x72; hotspots are in that space.

// Hotspots are the click-point inside the 72x72 glove art; tune per asset.
const CURSORS: Record<CursorState, CursorSpec> = {
	[Cursor.Pointer]: {
		path: '/assets/arcade/arpg/ui/cursor/glove3.png',
		// glove3's index finger points up-left; the click-point is its fingertip.
		hotX: 11,
		hotY: 11,
	},
	[Cursor.Hold]: {
		path: '/assets/arcade/arpg/ui/cursor/glove2.png',
		hotX: 36,
		hotY: 36,
	},
	[Cursor.Take]: {
		path: '/assets/arcade/arpg/ui/cursor/glove1.png',
		hotX: 32,
		hotY: 28,
	},
};

const texKey = (state: CursorState): string => `arpg-cursor-${state}`;

export function cursorPaths(): string[] {
	return Object.values(CURSORS).map((c) => arpgAsset(c.path));
}

export function preloadCursors(scene: Phaser.Scene): void {
	for (const [state, spec] of Object.entries(CURSORS)) {
		scene.load.image(
			texKey(Number(state) as CursorState),
			arpgAsset(spec.path),
		);
	}
}

/**
 * In-canvas cursor: a sprite drawn into the WebGL scene instead of a CSS image
 * cursor. Chromium drops `url()` image cursors while the canvas repaints every
 * frame (camera scrolling as the player moves), so the cursor would blink out;
 * a sprite is composited with the render and stays put. Positioned at the
 * pointer's world point and counter-scaled by zoom so it tracks the real cursor
 * and holds a constant on-screen size at any zoom. The native cursor is hidden
 * on the canvas only — the React HUD overlay keeps its own cursor.
 */
export class CursorController {
	private sprite: Phaser.GameObjects.Image;
	private current: CursorState | -1 = -1;

	constructor(private scene: Phaser.Scene) {
		scene.game.canvas.style.cursor = 'none';
		this.sprite = scene.add
			.image(0, 0, texKey(Cursor.Pointer))
			.setDepth(DEPTH_UI + 1000);
		this.set(Cursor.Pointer);
		scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
		scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
			scene.game.canvas.style.cursor = '';
		});
	}

	private tick(): void {
		const p = this.scene.input.activePointer;
		this.sprite.setPosition(p.worldX, p.worldY);
		this.sprite.setScale(1 / this.scene.cameras.main.zoom);
	}

	set(state: CursorState): void {
		if (state === this.current) return;
		this.current = state;
		const spec = CURSORS[state];
		this.sprite.setTexture(texKey(state));
		this.sprite.setOrigin(spec.hotX / ART, spec.hotY / ART);
	}

	clear(): void {
		this.current = -1;
		this.sprite.setVisible(false);
	}
}
