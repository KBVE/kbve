import { queryInRange, nearestInRange } from '@kbve/laser';
import type { GameWorld } from './world';
import { monsters } from './world';
import { Position, Active, MonsterTag } from './components';

export function monstersNearPlayer(
	world: GameWorld,
	playerEid: number,
	radius: number,
): number[] {
	return [
		...queryInRange(
			world,
			[Position, MonsterTag],
			Position,
			Position.x[playerEid],
			Position.y[playerEid],
			radius,
		),
	];
}

export function nearestMonster(
	world: GameWorld,
	playerEid: number,
	radius: number,
): number | null {
	return nearestInRange(
		world,
		[Position, MonsterTag],
		Position,
		Position.x[playerEid],
		Position.y[playerEid],
		radius,
	);
}

/**
 * Interest management: flips each monster's Active flag based on distance to the
 * player and invokes onChange only on transitions, so the scene can pause/resume
 * grid-engine wander + sprite rendering for far entities.
 */
export function cullMonsters(
	world: GameWorld,
	playerEid: number,
	radius: number,
	onChange: (eid: number, active: boolean) => void,
): void {
	const px = Position.x[playerEid];
	const py = Position.y[playerEid];
	const r2 = radius * radius;

	for (const eid of monsters(world)) {
		const dx = Position.x[eid] - px;
		const dy = Position.y[eid] - py;
		const inside = dx * dx + dy * dy <= r2;
		const was = Active.value[eid] === 1;
		if (inside !== was) {
			Active.value[eid] = inside ? 1 : 0;
			onChange(eid, inside);
		}
	}
}
