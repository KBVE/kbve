import { describe, it, expect } from 'vitest';
import { minecraftLens } from '../minecraft';
import type { McServerItem } from '../../mc/mcStream';

const item = (over: Partial<McServerItem> = {}): McServerItem => ({
	id: 'survival',
	name: 'survival',
	online: 2,
	max: 60,
	reachable: true,
	players: [
		{ name: 'alice', uuid: 'u1', skinUrl: null, server: 'survival' },
	],
	cachedAt: 1750000000,
	...over,
});

describe('minecraftLens', () => {
	it('search text covers server name, label, and player names', () => {
		const text = minecraftLens.searchText!(item());
		expect(text).toContain('survival');
		expect(text).toContain('Survival Backend');
		expect(text).toContain('alice');
	});
	it('groups by reachability', () => {
		expect(minecraftLens.group!(item())).toBe('Online');
		expect(minecraftLens.group!(item({ reachable: false }))).toBe('Unreachable');
	});
	it('filters split reachable vs unreachable vs with players', () => {
		const online = minecraftLens.filters!.find((f) => f.id === 'online')!;
		const offline = minecraftLens.filters!.find((f) => f.id === 'offline')!;
		const withPlayers = minecraftLens.filters!.find((f) => f.id === 'with_players')!;
		expect(online.predicate(item())).toBe(true);
		expect(offline.predicate(item({ reachable: false }))).toBe(true);
		expect(withPlayers.predicate(item({ players: [] }))).toBe(false);
	});
	it('stats aggregate totals', () => {
		const stats = minecraftLens.stats!([
			item(),
			item({ id: 'lobby', name: 'lobby', online: 1, reachable: false, players: [] }),
		]);
		const byId = Object.fromEntries(stats.map((s) => [s.id, s.value]));
		expect(byId['total']).toBe(2);
		expect(byId['online']).toBe(1);
		expect(byId['players']).toBe(3);
	});
});
