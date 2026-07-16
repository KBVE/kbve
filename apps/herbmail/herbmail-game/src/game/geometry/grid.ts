// A tile is a bitfield of orthogonal properties, so semantics compose (a tile can
// be SOLID without OCCLUDES, HAZARD without SOLID, etc.) and layer/membership tests
// are a single `&` instead of `=== A || === B` chains. The presets below are the
// exact combos the dungeon uses today, so `=== WALL` still matches while `& SOLID`
// also works — and new combos (hazard floors, team zones) just add flags.
//
// Buffer-agnostic on purpose: `tiles[i] & SOLID` runs identically whether `tiles`
// is backed by an ArrayBuffer or a SharedArrayBuffer, so this is forward-compatible
// with moving tile state to a worker (SAB) or uploading it to a GPU buffer.
export const SOLID = 1 << 0; // blocks movement
export const OCCLUDES = 1 << 1; // rock: blocks light + grows wall geometry
export const DOORWAY = 1 << 2; // arch opening
export const PILLAR = 1 << 3; // column: solid but sub-tile (radius collision), no occlude
export const PIT = 1 << 4; // recessed floor: open to walk into (you fall), no floor slab
export const OPEN = 1 << 5; // oasis interior: no ceiling slab, lit by the open sky

export const FLOOR = 0;
export const WALL = SOLID | OCCLUDES;
export const ARCH = DOORWAY;
export const COLUMN = SOLID | PILLAR;
export const OASIS = PIT;

export interface Grid {
	cols: number;
	rows: number;
	originCol: number;
	originRow: number;
	tileAt(col: number, row: number): number;
}

// "Solid" for geometry = rock that grows walls/coves and blocks light. Pillars are
// SOLID for movement but not OCCLUDES, so they don't spawn wall faces around them.
export function isSolidTile(t: number): boolean {
	return (t & OCCLUDES) !== 0;
}

export function gridSolid(grid: Grid, col: number, row: number): boolean {
	if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return true;
	return (grid.tileAt(col, row) & OCCLUDES) !== 0;
}

export function gridTile(grid: Grid, col: number, row: number): number {
	if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return WALL;
	return grid.tileAt(col, row);
}
