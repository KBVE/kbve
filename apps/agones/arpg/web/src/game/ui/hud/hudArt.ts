import { arpgAsset } from '../../config';

// HUD art geometry. Every coordinate below is in the SOURCE IMAGE's own pixel
// space (the `w`/`h` natural size). The renderers convert to percentages so the
// panel scales cleanly to any on-screen size. Tune these numbers against the art
// — nothing here is derived, it is all hand-placed so slots land in the frame.

export interface Rect {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

// ── Hotbar / action bar ────────────────────────────────────────────────────
// Source: assets/arcade/arpg/ui/hotbar_bar.webp (800x64). Nine slot cells flanked
// by gargoyle caps; the two cap sockets host OUR StatOrbs (not the baked gems).
export const HOTBAR_ART = {
	url: arpgAsset('/assets/arcade/arpg/ui/hotbar_bar.webp'),
	w: 800,
	h: 64,
	// Cell square: center-x of each of the 9 slots, shared center-y + size.
	cellY: 26,
	cellSize: 46,
	cellX: [108, 181, 254, 327, 400, 473, 546, 619, 692],
	// Orb sockets in the end caps (our StatOrb mounts here, covering the gem).
	orbLeft: { x: 38, y: 26, d: 40 },
	orbRight: { x: 765, y: 26, d: 40 },
} as const;

// ── Inventory panel ─────────────────────────────────────────────────────────
// Source: assets/arcade/arpg/ui/hud/inventory.webp (555x623). Left = storage
// grid, right = equipment paper-doll, top medallion, bottom button row.
export const INVENTORY_ART = {
	url: arpgAsset('/assets/arcade/arpg/ui/hud/inventory.webp'),
	w: 555,
	h: 623,
	// Storage grid: bounds of the bordered grid region (top-left → bottom-right);
	// cell pitch is derived as w/cols, h/rows (cells are not square here).
	grid: {
		x: 48,
		y: 82,
		w: 268,
		h: 338,
		cols: 6,
		rows: 7,
		// Baked divider thickness; cells inset by this so content clears the frame.
		border: 3,
	},
	// Equipment slots — STARTER positions, expect to nudge. id = equip slot the
	// server will map to once an equipment model exists; visual-only until then.
	equip: [
		{ id: 'head', x: 392, y: 78, w: 56, h: 56 },
		{ id: 'amulet', x: 460, y: 96, w: 36, h: 36 },
		{ id: 'mainHand', x: 340, y: 150, w: 50, h: 96 },
		{ id: 'chest', x: 400, y: 146, w: 60, h: 80 },
		{ id: 'offHand', x: 470, y: 150, w: 50, h: 96 },
		{ id: 'gloves', x: 340, y: 256, w: 50, h: 50 },
		{ id: 'belt', x: 400, y: 256, w: 60, h: 34 },
		{ id: 'boots', x: 470, y: 256, w: 50, h: 50 },
		{ id: 'ringL', x: 392, y: 300, w: 36, h: 36 },
		{ id: 'ringR', x: 440, y: 300, w: 36, h: 36 },
	] as Rect[],
} as const;

/** Convert an art-space pixel value to a percentage of the art's width/height. */
export function pctX(art: { w: number }, px: number): string {
	return `${(px / art.w) * 100}%`;
}
export function pctY(art: { h: number }, px: number): string {
	return `${(px / art.h) * 100}%`;
}
