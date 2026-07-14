import { describe, it, expect } from 'vitest';
import type { TileXY } from '../tile/path';
import {
	AttackShape,
	MELEE_RANGE,
	aoeTiles,
	inRangeAdjacent,
	lineCast,
} from './index';

const open = () => false;

describe('combat geometry — parity with simgrid combat.rs', () => {
	it('adjacent range gate', () => {
		const a = { x: 4, y: 4 };
		expect(inRangeAdjacent(a, { x: 5, y: 5 }, MELEE_RANGE)).toBe(true);
		expect(inRangeAdjacent(a, { x: 6, y: 4 }, MELEE_RANGE)).toBe(false);
	});

	it('line_cast open path matches the frozen Rust vector', () => {
		const path = lineCast({ x: 0, y: 0 }, { x: 5, y: 3 }, 10, open);
		expect(path).toEqual([
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
			{ x: 3, y: 2 },
			{ x: 4, y: 2 },
			{ x: 5, y: 3 },
		]);
	});

	it('line_cast stops at the first wall', () => {
		const wall = (t: TileXY) => t.x === 3;
		const path = lineCast({ x: 0, y: 0 }, { x: 6, y: 0 }, 10, wall);
		expect(path[path.length - 1]).toEqual({ x: 3, y: 0 });
	});

	it('line_cast respects max range', () => {
		const path = lineCast({ x: 0, y: 0 }, { x: 20, y: 0 }, 4, open);
		expect(path.length).toBe(4);
		expect(path[path.length - 1]).toEqual({ x: 4, y: 0 });
	});

	it('aoe radius 1 is nine tiles', () => {
		const tiles = aoeTiles({ x: 2, y: 2 }, 1);
		expect(tiles.length).toBe(9);
		expect(tiles[0]).toEqual({ x: 1, y: 1 });
		expect(tiles[8]).toEqual({ x: 3, y: 3 });
	});

	it('AttackShape enum matches Rust ordering', () => {
		expect(AttackShape.Adjacent).toBe(0);
		expect(AttackShape.Line).toBe(1);
		expect(AttackShape.Aoe).toBe(2);
	});
});
