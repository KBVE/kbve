import { describe, it, expect } from 'vitest';
import { Domain, mix32, mulberry32, rollPct } from './index';

describe('determ — cross-language parity with simgrid rng.rs', () => {
	it('matches the frozen Rust parity vectors', () => {
		// Frozen in packages/rust/simgrid/src/rng.rs (parity_vectors_frozen).
		// If either side changes, update both together.
		expect(mix32([1337, Domain.COMBAT, 7, 42])).toBe(3335238993);
		expect(rollPct(1337, Domain.COMBAT, [7, 42])).toBe(15);
		expect(rollPct(1337, Domain.DUNGEON, [7, 42])).toBe(20);
	});

	it('domains decorrelate', () => {
		expect(rollPct(1337, Domain.COMBAT, [7, 42])).not.toBe(
			rollPct(1337, Domain.DUNGEON, [7, 42]),
		);
	});

	it('rolls are deterministic', () => {
		expect(rollPct(1337, Domain.COMBAT, [7, 42])).toBe(
			rollPct(1337, Domain.COMBAT, [7, 42]),
		);
	});

	it('FourCC domains match Rust from_be_bytes', () => {
		expect(Domain.COMBAT).toBe(0x434f4d42);
		expect(Domain.DUNGEON).toBe(0x44554e47);
		expect(Domain.WANDER).toBe(0x57414e44);
		expect(Domain.LOOT).toBe(0x4c4f4f54);
	});

	it('mulberry32 is reproducible', () => {
		expect(mulberry32(0xdeadbeef)()).toBe(mulberry32(0xdeadbeef)());
	});
});
