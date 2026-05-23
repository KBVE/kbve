import { describe, expect, it } from 'vitest';
import { generatePath } from './path-generator';
import { mulberry32 } from './random';

describe('generatePath (seeded)', () => {
	it('same seed produces same waypoints', () => {
		const a = generatePath(mulberry32(12345));
		const b = generatePath(mulberry32(12345));
		expect(a.waypoints).toEqual(b.waypoints);
		expect(a.startRow).toBe(b.startRow);
		expect(a.endRow).toBe(b.endRow);
	});

	it('different seeds usually differ', () => {
		const a = generatePath(mulberry32(1));
		const b = generatePath(mulberry32(2));
		const aJson = JSON.stringify(a.waypoints);
		const bJson = JSON.stringify(b.waypoints);
		expect(aJson).not.toBe(bJson);
	});

	it('returns at least two waypoints', () => {
		const path = generatePath(mulberry32(7));
		expect(path.waypoints.length).toBeGreaterThanOrEqual(2);
	});

	it('segments + waypoints are consistent (segments = waypoints - 1)', () => {
		const path = generatePath(mulberry32(99));
		expect(path.segments.length).toBe(path.waypoints.length - 1);
	});
});
