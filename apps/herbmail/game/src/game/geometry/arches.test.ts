import { describe, it, expect } from 'vitest';
import { buildArches, buildTrims } from './arches';
import { genSectorDesc, makeLocalGrid } from '../dungeon/generate';

describe('buildTrims', () => {
	it('emits a proud molding ring wherever arches exist', () => {
		const d = genSectorDesc(1337, 0, 0);
		const g = makeLocalGrid(d);
		const trims = buildTrims(g, d.variant);
		const arches = buildArches(g, d.variant);
		expect(trims.attributes.position.count).toBeGreaterThan(0);
		trims.computeBoundingBox();
		arches.computeBoundingBox();
		expect(trims.boundingBox!.max.y).toBeGreaterThan(0);
	});
});
