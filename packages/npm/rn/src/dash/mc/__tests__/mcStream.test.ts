import { describe, it, expect } from 'vitest';
import { mapPlayerList } from '../mcStream';
import type { RawMcPlayerList } from '../mcStream';

const raw: RawMcPlayerList = {
	online: 3,
	max: 120,
	players: [
		{ name: 'alice', uuid: 'u1', skin_url: null, server: 'survival' },
		{ name: 'bob', uuid: 'u2', skin_url: 's2', server: 'survival' },
		{ name: 'carol', uuid: null, skin_url: null, server: 'lobby' },
	],
	servers: [
		{ server: 'survival', online: 2, max: 60, reachable: true },
		{ server: 'creative', online: 0, max: 20, reachable: true },
		{ server: 'lobby', online: 1, max: 40, reachable: true },
		{ server: 'velocity', online: 3, max: 200, reachable: false },
	],
	cached_at: 1750000000,
};

describe('mapPlayerList', () => {
	it('joins players onto their server', () => {
		const items = mapPlayerList(raw);
		const survival = items.find((i) => i.id === 'survival')!;
		expect(survival.players.map((p) => p.name)).toEqual(['alice', 'bob']);
		expect(survival.players[1].skinUrl).toBe('s2');
		const velocity = items.find((i) => i.id === 'velocity')!;
		expect(velocity.players).toEqual([]);
		expect(velocity.reachable).toBe(false);
	});
	it('orders known servers first, unknown appended', () => {
		expect(mapPlayerList(raw).map((i) => i.id)).toEqual([
			'velocity',
			'lobby',
			'survival',
			'creative',
		]);
	});
	it('carries cached_at onto every item', () => {
		expect(mapPlayerList(raw).every((i) => i.cachedAt === 1750000000)).toBe(
			true,
		);
	});
	it('handles empty payload', () => {
		expect(
			mapPlayerList({
				online: 0,
				max: 0,
				players: [],
				servers: [],
				cached_at: 0,
			}),
		).toEqual([]);
	});
});
