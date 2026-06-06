import { queryInRange, nearestInRange } from '@kbve/laser';
import type { GameWorld } from './world';
import { Position, MonsterTag } from './components';

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
