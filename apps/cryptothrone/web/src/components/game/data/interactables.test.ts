import { describe, it, expect } from 'vitest';
import { getZoneInteractables, interactableAt } from './interactables';

describe('zone interactables', () => {
	it('returns cloud-city interactables and none for unknown zones', () => {
		expect(getZoneInteractables('cloud-city').length).toBeGreaterThan(0);
		expect(getZoneInteractables('nowhere')).toEqual([]);
	});

	it('matches a tile inside an interactable, misses outside', () => {
		const list = getZoneInteractables('cloud-city');
		const sign = list.find((i) => i.ref === 'sign')!;
		const { xMin, xMax, yMin, yMax } = sign.bounds;
		// inside the sign bounds
		expect(interactableAt(list, xMin, yMin)?.ref).toBe('sign');
		expect(interactableAt(list, xMax, yMax)?.ref).toBe('sign');
		// far outside any interactable
		expect(interactableAt(list, 40, 40)).toBeUndefined();
		// one past the edge
		expect(interactableAt(list, xMax + 1, yMax + 1)?.ref).not.toBe('sign');
	});

	it('every interactable has a message and valid bounds', () => {
		for (const it of getZoneInteractables('cloud-city')) {
			expect(it.message.length).toBeGreaterThan(0);
			expect(it.bounds.xMin).toBeLessThanOrEqual(it.bounds.xMax);
			expect(it.bounds.yMin).toBeLessThanOrEqual(it.bounds.yMax);
		}
	});
});
