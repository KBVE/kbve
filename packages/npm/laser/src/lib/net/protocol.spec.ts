import { describe, it, expect } from 'vitest';
import {
	joinFrame,
	inputFrame,
	decodeCard,
	bjShoeOrder,
	verifyBlackjackCommitment,
	PROTOCOL_VERSION,
	GENE_STATS,
	IV_MAX,
	IV_TOTAL_MAX,
	NATURE_COUNT,
	NATURE_STATS,
	natureEffect,
	genderGlyph,
} from './protocol';

describe('simgrid JSON wire (serde externally-tagged)', () => {
	it('joinFrame matches the server JoinMatch shape', () => {
		expect(joinFrame('tok', 'ann')).toEqual({
			JoinMatch: {
				protocol: PROTOCOL_VERSION,
				jwt: 'tok',
				kbve_username: 'ann',
			},
		});
	});

	it('inputFrame wraps a Step input', () => {
		expect(inputFrame(5, [{ Step: { dir: 'Up' } }])).toEqual({
			Frame: { client_tick: 5, inputs: [{ Step: { dir: 'Up' } }] },
		});
	});

	it('unit-variant Leave serializes as a bare string', () => {
		expect(JSON.stringify(inputFrame(1, ['Leave']))).toBe(
			'{"Frame":{"client_tick":1,"inputs":["Leave"]}}',
		);
	});

	it('blackjack inputs match the server enum shapes', () => {
		expect(inputFrame(1, [{ JoinTable: { table_ref: 't' } }])).toEqual({
			Frame: {
				client_tick: 1,
				inputs: [{ JoinTable: { table_ref: 't' } }],
			},
		});
		expect(JSON.stringify(inputFrame(1, ['LeaveTable']))).toContain(
			'"LeaveTable"',
		);
		expect(inputFrame(1, [{ BjAction: { kind: 'Hit' } }])).toEqual({
			Frame: { client_tick: 1, inputs: [{ BjAction: { kind: 'Hit' } }] },
		});
	});
});

describe('decodeCard (6-bit server card byte)', () => {
	it('decodes rank, suit, points and colour', () => {
		// suit 0 (spades), rank 0 (A) -> byte 0
		expect(decodeCard(0)).toEqual({
			suit: 'spades',
			rank: 'A',
			points: 11,
			red: false,
		});
		// suit 1 (hearts) << 4 | rank 12 (K) = 0b011100 = 28
		expect(decodeCard((1 << 4) | 12)).toEqual({
			suit: 'hearts',
			rank: 'K',
			points: 10,
			red: true,
		});
		// suit 3 (clubs) << 4 | rank 9 (10) = 0b110101 = 57
		expect(decodeCard((3 << 4) | 9)).toEqual({
			suit: 'clubs',
			rank: '10',
			points: 10,
			red: false,
		});
	});
});

describe('provable fairness (parity with simgrid blackjack.rs)', () => {
	it('bjShoeOrder replays the server shoe for a seed', () => {
		const shoe = bjShoeOrder('123');
		expect(shoe).toHaveLength(208);
		// Cross-language vector pinned by the Rust shoe_for_seed(123) test.
		expect(shoe.slice(0, 8)).toEqual([18, 1, 1, 33, 18, 26, 7, 35]);
	});

	it('verifyBlackjackCommitment matches the server SHA-256 commitment', async () => {
		await expect(
			verifyBlackjackCommitment(
				'123',
				'4f319987a786107dc63b2b70115b3734cb9880b099b70c463c5e1b05521ab764',
			),
		).resolves.toBe(true);
		await expect(
			verifyBlackjackCommitment(
				'124',
				'4f319987a786107dc63b2b70115b3734cb9880b099b70c463c5e1b05521ab764',
			),
		).resolves.toBe(false);
	});
});

// Mirrors `simgrid::genes` — the nature byte is an encoding, so the client decodes it rather
// than the server sending the two stat names. These assertions are what keep that honest.
describe('pet genetics (parity with simgrid genes.rs)', () => {
	it('decodes the boosted and lowered stat from a nature byte', () => {
		// boosted = Atk (0), lowered = Spe (4) -> 0 * 5 + 4
		expect(natureEffect(4)).toEqual({ up: 'Atk', down: 'Spe' });
		// boosted = SpA (2), lowered = Def (1) -> 2 * 5 + 1
		expect(natureEffect(11)).toEqual({ up: 'SpA', down: 'Def' });
	});

	it('reads the five diagonal natures as neutral', () => {
		for (const n of [0, 6, 12, 18, 24]) {
			expect(natureEffect(n)).toEqual({ up: null, down: null });
		}
		const neutral = Array.from({ length: NATURE_COUNT }, (_, n) =>
			natureEffect(n),
		).filter((e) => e.up === null).length;
		expect(neutral).toBe(NATURE_STATS.length);
	});

	it('never returns a nature that raises and lowers the same stat', () => {
		for (let n = 0; n < NATURE_COUNT; n++) {
			const { up, down } = natureEffect(n);
			if (up !== null) expect(up).not.toBe(down);
		}
	});

	it('wraps an out-of-range nature byte instead of reading undefined', () => {
		// Rust `Nature::from_index` takes the same modulo, so a corrupt byte degrades to a real
		// nature on both sides rather than rendering "undefined" in the hub.
		expect(natureEffect(NATURE_COUNT)).toEqual(natureEffect(0));
		expect(natureEffect(255)).toEqual(natureEffect(255 % NATURE_COUNT));
		expect(natureEffect(-1)).toEqual(natureEffect(NATURE_COUNT - 1));
	});

	it('pins the gene stat order the ivs array arrives in', () => {
		expect(GENE_STATS).toEqual(['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe']);
		expect(IV_TOTAL_MAX).toBe(IV_MAX * 6);
	});

	it('renders a gender glyph for each wire byte', () => {
		expect(genderGlyph(0)).toBe('');
		expect(genderGlyph(1)).toBe('\u2642');
		expect(genderGlyph(2)).toBe('\u2640');
		expect(genderGlyph(9)).toBe('');
	});
});
