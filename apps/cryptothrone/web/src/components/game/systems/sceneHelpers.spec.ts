import { describe, it, expect } from 'vitest';
import {
	PLAYER_SPRITE_VARIANTS,
	spriteVariantForName,
	zoneLabelForTile,
} from './sceneHelpers';

describe('spriteVariantForName', () => {
	it('is deterministic and within range', () => {
		for (const name of ['ann', 'bob', 'cryptothrone', '']) {
			const v = spriteVariantForName(name);
			expect(v).toBe(spriteVariantForName(name));
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(PLAYER_SPRITE_VARIANTS);
		}
	});

	it('varies across names', () => {
		const set = new Set(
			['ann', 'bob', 'carol', 'dave', 'eve'].map(spriteVariantForName),
		);
		expect(set.size).toBeGreaterThan(1);
	});
});

describe('zoneLabelForTile', () => {
	it('labels the known zone centers', () => {
		expect(zoneLabelForTile({ x: 5, y: 12 })).toBe('Cloud City Plaza');
		expect(zoneLabelForTile({ x: 24, y: 24 })).toBe('Goblin Camp');
		expect(zoneLabelForTile({ x: 34, y: 30 })).toBe('Crystal Cavern');
	});

	it('falls back to The Wilds outside any zone', () => {
		expect(zoneLabelForTile({ x: 0, y: 0 })).toBe('The Wilds');
	});
});
