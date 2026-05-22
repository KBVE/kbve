import { describe, expect, it } from 'vitest';
import { Position } from '../components';
import { SpatialGrid } from './spatial';

describe('SpatialGrid', () => {
	it('rebuilds buckets and answers in-range queries', () => {
		const grid = new SpatialGrid({
			cellSize: 64,
			worldWidth: 256,
			worldHeight: 256,
		});
		const eids = [1, 2, 3];
		Position.x[1] = 32;
		Position.y[1] = 32;
		Position.x[2] = 200;
		Position.y[2] = 200;
		Position.x[3] = 48;
		Position.y[3] = 48;
		grid.rebuild(eids, () => true);
		const hits: number[] = [];
		grid.forEachInRange(
			40,
			40,
			32,
			() => true,
			(id) => hits.push(id),
		);
		expect(hits).toContain(1);
		expect(hits).toContain(3);
		expect(hits).not.toContain(2);
	});

	it('clamps positions outside world bounds into edge buckets', () => {
		const grid = new SpatialGrid({
			cellSize: 80,
			worldWidth: 240,
			worldHeight: 240,
		});
		Position.x[10] = -40;
		Position.y[10] = 120;
		grid.rebuild([10], () => true);
		const hits: number[] = [];
		grid.forEachInRange(
			0,
			120,
			60,
			() => true,
			(id) => hits.push(id),
		);
		expect(hits).toContain(10);
	});

	it('skips entries where isAlive returns false', () => {
		const grid = new SpatialGrid({
			cellSize: 64,
			worldWidth: 256,
			worldHeight: 256,
		});
		Position.x[5] = 64;
		Position.y[5] = 64;
		grid.rebuild([5], () => false);
		const hits: number[] = [];
		grid.forEachInRange(
			64,
			64,
			32,
			() => true,
			(id) => hits.push(id),
		);
		expect(hits).toEqual([]);
	});
});
