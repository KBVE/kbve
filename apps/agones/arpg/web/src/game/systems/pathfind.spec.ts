import { describe, it, expect } from 'vitest';
import {
	findPath,
	smoothPath,
	findHierPath,
	type IsFloor,
	type GateGraph,
} from './pathfind';
import type { TileXY } from '../iso';

/**
 * Grids are written as ASCII so the geometry under test is readable: '#' is
 * wall, anything else is floor. Out-of-bounds reads are walls, which is what
 * the dungeon's own isFloor does at the edge of generated space.
 */
function grid(rows: string[]): IsFloor {
	return (x, y) =>
		y >= 0 && y < rows.length && x >= 0 && x < rows[y].length
			? rows[y][x] !== '#'
			: false;
}

const at = (p: TileXY, x: number, y: number) => p.x === x && p.y === y;

/** Each step must be a king-move, and no step may land on a wall. */
function assertWalkable(start: TileXY, path: TileXY[], isFloor: IsFloor): void {
	let prev = start;
	for (const step of path) {
		expect(isFloor(step.x, step.y), `${step.x},${step.y} is a wall`).toBe(
			true,
		);
		const dx = Math.abs(step.x - prev.x);
		const dy = Math.abs(step.y - prev.y);
		expect(
			Math.max(dx, dy),
			`${prev.x},${prev.y} -> ${step.x},${step.y} is not one step`,
		).toBe(1);
		prev = step;
	}
}

describe('findPath', () => {
	const OPEN = grid(['.....', '.....', '.....', '.....', '.....']);

	it('returns null when the start is not floor', () => {
		const g = grid(['#..', '...']);
		expect(findPath({ x: 0, y: 0 }, { x: 2, y: 1 }, g)).toBeNull();
	});

	it('returns an empty path when already at the goal', () => {
		expect(findPath({ x: 2, y: 2 }, { x: 2, y: 2 }, OPEN)).toEqual([]);
	});

	it('excludes the start and includes the goal', () => {
		const p = findPath({ x: 0, y: 0 }, { x: 3, y: 0 }, OPEN)!;
		expect(p).not.toBeNull();
		expect(p.some((s) => at(s, 0, 0))).toBe(false);
		expect(at(p[p.length - 1], 3, 0)).toBe(true);
	});

	it('takes the diagonal across open ground', () => {
		const p = findPath({ x: 0, y: 0 }, { x: 4, y: 4 }, OPEN)!;
		// 4 diagonal steps beats 8 orthogonal ones.
		expect(p).toHaveLength(4);
		assertWalkable({ x: 0, y: 0 }, p, OPEN);
	});

	it('routes around a wall rather than through it', () => {
		const g = grid(['..#..', '..#..', '..#..', '..#..', '.....']);
		const p = findPath({ x: 0, y: 0 }, { x: 4, y: 0 }, g)!;
		expect(p).not.toBeNull();
		assertWalkable({ x: 0, y: 0 }, p, g);
		// The only gap is the bottom row, so the path must dip to y=4.
		expect(p.some((s) => s.y === 4)).toBe(true);
	});

	it('refuses to cut a wall corner diagonally', () => {
		// The only way from (0,0) to (1,1) diagonally would clip both walls.
		const g = grid(['.#', '#.']);
		expect(findPath({ x: 0, y: 0 }, { x: 1, y: 1 }, g)).toBeNull();
	});

	it('steps around when only one orthogonal neighbour is open', () => {
		// A diagonal needs BOTH orthogonals, so this routes (0,0)->(1,0)->(1,1)
		// rather than clipping the wall at (0,1).
		const g = grid(['..', '#.']);
		const p = findPath({ x: 0, y: 0 }, { x: 1, y: 1 }, g)!;
		expect(p).toHaveLength(2);
		expect(at(p[0], 1, 0)).toBe(true);
		expect(at(p[1], 1, 1)).toBe(true);
	});

	it('returns null for a sealed goal', () => {
		const g = grid(['.....', '.###.', '.#.#.', '.###.', '.....']);
		expect(findPath({ x: 0, y: 0 }, { x: 2, y: 2 }, g)).toBeNull();
	});

	it('retargets a wall goal to the nearest floor tile', () => {
		const g = grid(['....#', '.....']);
		const p = findPath({ x: 0, y: 0 }, { x: 4, y: 0 }, g)!;
		expect(p).not.toBeNull();
		const end = p[p.length - 1];
		expect(g(end.x, end.y)).toBe(true);
		// Walked up to the wall, not onto it.
		expect(Math.max(Math.abs(end.x - 4), Math.abs(end.y - 0))).toBe(1);
	});

	it('gives up rather than hanging when the node budget is exhausted', () => {
		const wide = grid(Array.from({ length: 40 }, () => '.'.repeat(40)));
		expect(findPath({ x: 0, y: 0 }, { x: 39, y: 39 }, wide, 4)).toBeNull();
	});

	it('produces a contiguous walkable path through a corridor maze', () => {
		const g = grid([
			'.........',
			'#######..',
			'..#......',
			'..#.####.',
			'.....#...',
		]);
		const start = { x: 0, y: 0 };
		const p = findPath(start, { x: 0, y: 4 }, g)!;
		expect(p).not.toBeNull();
		assertWalkable(start, p, g);
		expect(at(p[p.length - 1], 0, 4)).toBe(true);
	});
});

describe('smoothPath', () => {
	const OPEN = grid(['.....', '.....', '.....', '.....', '.....']);

	it('passes through a path of one or zero steps', () => {
		expect(smoothPath({ x: 0, y: 0 }, [], OPEN)).toEqual([]);
		const one = [{ x: 1, y: 0 }];
		expect(smoothPath({ x: 0, y: 0 }, one, OPEN)).toBe(one);
	});

	it('collapses a straight open run to its endpoint', () => {
		const start = { x: 0, y: 0 };
		const raw = findPath(start, { x: 4, y: 0 }, OPEN)!;
		expect(raw.length).toBeGreaterThan(1);
		const out = smoothPath(start, raw, OPEN);
		expect(out).toHaveLength(1);
		expect(at(out[0], 4, 0)).toBe(true);
	});

	it('keeps the goal as the final waypoint', () => {
		const g = grid(['..#..', '..#..', '.....']);
		const start = { x: 0, y: 0 };
		const raw = findPath(start, { x: 4, y: 0 }, g)!;
		const out = smoothPath(start, raw, g);
		expect(at(out[out.length - 1], 4, 0)).toBe(true);
	});

	it('never emits more waypoints than it was given', () => {
		const g = grid(['..#..', '..#..', '.....']);
		const start = { x: 0, y: 0 };
		const raw = findPath(start, { x: 4, y: 0 }, g)!;
		const out = smoothPath(start, raw, g);
		expect(out.length).toBeLessThanOrEqual(raw.length);
		// Every kept waypoint came from the original path.
		for (const w of out) {
			expect(raw.some((r) => at(r, w.x, w.y))).toBe(true);
		}
	});

	it('keeps a corner waypoint when the wall blocks line of sight', () => {
		const g = grid(['...', '##.', '...']);
		const start = { x: 0, y: 0 };
		const raw = findPath(start, { x: 0, y: 2 }, g)!;
		const out = smoothPath(start, raw, g);
		// Straight start->goal crosses the wall row, so it cannot collapse to one.
		expect(out.length).toBeGreaterThan(1);
	});
});

describe('findHierPath', () => {
	/**
	 * Chunked view of a plain open map: 4x4 chunks, gate at each chunk's centre,
	 * every orthogonal neighbour connected. Counters let the tests assert whether
	 * the coarse gate route was actually consulted or bypassed.
	 */
	function openGraph(chunkSize = 4) {
		const calls = { gate: 0, passage: 0 };
		const graph: GateGraph = {
			chunkSize,
			chunkOf: (x, y) => ({
				cx: Math.floor(x / chunkSize),
				cy: Math.floor(y / chunkSize),
			}),
			gate: (cx, cy) => {
				calls.gate++;
				return {
					x: cx * chunkSize + (chunkSize >> 1),
					y: cy * chunkSize + (chunkSize >> 1),
				};
			},
			passageWidth: () => {
				calls.passage++;
				return 3;
			},
		};
		return { graph, calls };
	}

	const BIG = grid(Array.from({ length: 20 }, () => '.'.repeat(20)));

	it('skips the gate graph for a same-chunk move', () => {
		const { graph, calls } = openGraph();
		const p = findHierPath({ x: 0, y: 0 }, { x: 2, y: 2 }, BIG, graph)!;
		expect(p).not.toBeNull();
		expect(at(p[p.length - 1], 2, 2)).toBe(true);
		expect(calls.passage).toBe(0);
	});

	it('skips the gate graph for an adjacent-chunk move', () => {
		const { graph, calls } = openGraph();
		const p = findHierPath({ x: 1, y: 1 }, { x: 6, y: 1 }, BIG, graph)!;
		expect(p).not.toBeNull();
		expect(calls.passage).toBe(0);
	});

	it('consults the gate graph for a distant move and still reaches the goal', () => {
		const { graph, calls } = openGraph();
		const start = { x: 1, y: 1 };
		const goal = { x: 18, y: 18 };
		const p = findHierPath(start, goal, BIG, graph)!;
		expect(p).not.toBeNull();
		expect(calls.passage).toBeGreaterThan(0);
		expect(at(p[p.length - 1], goal.x, goal.y)).toBe(true);
	});

	it('smooths a gate-routed path back to a direct run on open ground', () => {
		// The gate route detours through chunk centres, but string-pulling has
		// clear line of sight the whole way on an open map, so the detour is
		// erased. This is what keeps a long click from stair-stepping via gates.
		const { graph } = openGraph();
		const start = { x: 1, y: 1 };
		const goal = { x: 18, y: 1 };
		const p = findHierPath(start, goal, BIG, graph)!;
		expect(p).not.toBeNull();
		expect(p).toHaveLength(1);
		expect(at(p[0], goal.x, goal.y)).toBe(true);
	});

	it('keeps the gate detour when walls block the direct line', () => {
		const rows = Array.from({ length: 20 }, () => '.'.repeat(20));
		// Wall across the middle chunk row, with a gap on the far left.
		rows[9] = '..' + '#'.repeat(18);
		const g = grid(rows);
		const { graph } = openGraph();
		const start = { x: 1, y: 1 };
		const goal = { x: 18, y: 18 };
		const p = findHierPath(start, goal, g, graph)!;
		expect(p).not.toBeNull();
		expect(at(p[p.length - 1], goal.x, goal.y)).toBe(true);
		// It must funnel through the left-hand gap rather than crossing the wall.
		expect(p.some((s) => s.x <= 2)).toBe(true);
	});

	it('falls back to a direct search when a gate leg is unreachable', () => {
		// Gates land inside a sealed pillar, so every leg fails at tile level.
		const g = grid([
			'....................',
			'....................',
			'..####..............',
			'..#..#..............',
			'..####..............',
			'....................',
			'....................',
			'....................',
		]);
		const graph: GateGraph = {
			chunkSize: 4,
			chunkOf: (x, y) => ({
				cx: Math.floor(x / 4),
				cy: Math.floor(y / 4),
			}),
			gate: () => ({ x: 3, y: 3 }),
			passageWidth: () => 3,
		};
		const start = { x: 0, y: 0 };
		const p = findHierPath(start, { x: 19, y: 7 }, g, graph)!;
		expect(p).not.toBeNull();
		expect(at(p[p.length - 1], 19, 7)).toBe(true);
	});

	it('returns null when the goal is walled off entirely', () => {
		const g = grid([
			'.........',
			'.........',
			'....###..',
			'....#.#..',
			'....###..',
			'.........',
		]);
		const { graph } = openGraph();
		expect(
			findHierPath({ x: 0, y: 0 }, { x: 5, y: 3 }, g, graph),
		).toBeNull();
	});
});
