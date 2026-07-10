import { useMemo } from 'react';
import { usePlacedTorches, torchTransform, type Torch } from '../torches';
import { useActiveRooms } from './store';

// Combined torch list for the currently-streamed dungeon: per-room decor
// (deterministic from each active room's desc) plus player-placed torches.
// Shared by WallTorches (meshes + flames) and TorchLighting (shader lights) so
// both draw from one source.
export function useDungeonTorches(): Torch[] {
	const rooms = useActiveRooms();
	const placed = usePlacedTorches();
	return useMemo(() => {
		const out: Torch[] = [];
		for (const r of rooms) {
			for (const s of r.desc.torches) {
				const wc = r.desc.originCol + s.col;
				const wr = r.desc.originRow + s.row;
				const { pos, dir } = torchTransform(wc, wr, s.di);
				const id =
					(Math.imul(wc, 73856093) ^
						Math.imul(wr, 19349663) ^
						Math.imul(s.di + 1, 2654435761)) >>>
					0;
				out.push({ id, pos, dir, cx: r.desc.cx, cy: r.desc.cy });
			}
		}
		for (const t of placed) out.push(t);
		return out;
	}, [rooms, placed]);
}
