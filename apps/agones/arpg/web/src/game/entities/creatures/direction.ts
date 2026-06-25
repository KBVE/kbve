import { facingDegFromDelta, SOUTH_DEG } from '../classes';
import { type CreatureDir } from './model';

/** Snap continuous screen-facing degrees to one of the 8 creature directions. */
export function dirFromDeg(deg: number): CreatureDir {
	const idx = ((Math.round(deg / 45) % 8) + 8) % 8;
	// 0=N,45=NE,90=E,135=SE,180=S,225=SW,270=W,315=NW
	return (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const)[idx];
}

/** Map a tile-space movement delta straight to the nearest creature direction. */
export function nearestCreatureDir(dx: number, dy: number): CreatureDir {
	return dirFromDeg(facingDegFromDelta(dx, dy));
}

export const CREATURE_SOUTH = SOUTH_DEG;
