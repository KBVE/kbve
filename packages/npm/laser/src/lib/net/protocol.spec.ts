import { describe, it, expect } from 'vitest';
import {
	joinFrame,
	inputFrame,
	decodeCard,
	bjShoeOrder,
	verifyBlackjackCommitment,
	PROTOCOL_VERSION,
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
