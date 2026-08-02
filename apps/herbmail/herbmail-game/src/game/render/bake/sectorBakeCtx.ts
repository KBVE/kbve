import { makeLocalGrid, type RoomDesc } from '../../dungeon/generate';
import { staticEmitters } from '../../prop/staticEmitters';
import { isSuppressed, placedForSector } from '../../prop/placed';
import { TILE } from '../../config';
import { HEAD_OFFSET, HEAD_REACH } from '../LightSystem';
import { TORCH_STRIDE } from './bakeTypes';
import type { SectorBakeCtx } from './bakePool';

// Player-editable torches (placed or removed) would make a baked sector wrong
// until it re-bakes, so those sectors opt out and stay fully dynamic.
function sectorIsEditable(desc: RoomDesc): boolean {
	if (placedForSector(desc.cx, desc.cy).length) return true;
	for (const e of staticEmitters(desc)) {
		const world: [number, number, number] = [
			e.pos[0] + desc.originCol * TILE,
			e.pos[1],
			e.pos[2] + desc.originRow * TILE,
		];
		if (isSuppressed(world)) return true;
	}
	return false;
}

export function sectorBakeCtx(desc: RoomDesc): SectorBakeCtx | null {
	if (sectorIsEditable(desc)) return null;

	const emitters = staticEmitters(desc);
	if (!emitters.length) return null;

	const torches = new Float32Array(emitters.length * TORCH_STRIDE);
	emitters.forEach((e, i) => {
		const [dx, dy, dz] = e.dir;
		const len = Math.hypot(dx, dy, dz) || 1;
		const o = i * TORCH_STRIDE;
		// Match LightSystem's flame-head offset exactly, or baked and dynamic
		// lighting disagree on where the torch actually is.
		torches[o] = e.pos[0] + (dx / len) * HEAD_REACH;
		torches[o + 1] = e.pos[1] + (dy / len) * HEAD_REACH + HEAD_OFFSET;
		torches[o + 2] = e.pos[2] + (dz / len) * HEAD_REACH;
		torches[o + 3] = e.preset.r;
		torches[o + 4] = e.preset.g;
		torches[o + 5] = e.preset.b;
		torches[o + 6] = e.preset.intensity;
	});

	const grid = makeLocalGrid(desc);
	const tiles = new Uint8Array(desc.cols * desc.rows);
	for (let r = 0; r < desc.rows; r++)
		for (let c = 0; c < desc.cols; c++)
			tiles[r * desc.cols + c] = grid.tileAt(c, r);

	return {
		signature: desc.signature,
		tiles,
		cols: desc.cols,
		rows: desc.rows,
		tile: TILE,
		torches,
	};
}
