import { describe, it, expect } from 'vitest';
import { joinFrame, inputFrame, PROTOCOL_VERSION } from './protocol';

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
});
