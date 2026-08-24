import { beforeAll, describe, expect, it } from 'vitest';
import {
	ADDRESS_FIELDS,
	type WorldServer,
	assignedMapCount,
	isRoutableAddress,
	mapOwnerConflicts,
} from '../src/cluster-topology';
import { redisGet, redisKeys } from './helpers/compose';

describe('servers-registry cluster membership', () => {
	let worldServers: Record<string, WorldServer> = {};

	// Read inside a hook, not at collection time: an it.each() argument runs
	// while vitest is still collecting, so a stack that is down took the whole
	// file with it instead of reporting a failed test.
	beforeAll(() => {
		worldServers = Object.fromEntries(
			redisKeys('ws:*').map((key) => [
				key,
				JSON.parse(redisGet(key) || '{}') as WorldServer,
			]),
		);
	});

	it('has at least one worldserver registered under ws:*', () => {
		expect(Object.keys(worldServers).length).toBeGreaterThan(0);
	});

	it('indexes registered worldservers on realm 1', () => {
		expect(redisKeys('realm:1:wss')).toContain('realm:1:wss');
	});

	it('has at least one gateway registered under gw:*', () => {
		expect(redisKeys('gw:*').length).toBeGreaterThan(0);
	});

	it('assigns every map to exactly one worldserver', () => {
		expect(mapOwnerConflicts(worldServers)).toEqual([]);
		expect(assignedMapCount(worldServers)).toBeGreaterThan(0);
	});

	it('advertises routable addresses on every worldserver', () => {
		for (const [key, server] of Object.entries(worldServers)) {
			for (const field of ADDRESS_FIELDS) {
				expect(
					isRoutableAddress(server[field]),
					`${key}.${field} is ${server[field] ?? 'missing'}`,
				).toBe(true);
			}
		}
	});

	it('holds map assignments on realm 1', () => {
		for (const [key, server] of Object.entries(worldServers)) {
			expect(server.RealmID, `${key}.RealmID`).toBe(1);
			expect(
				server.AssignedMapsToHandle?.length ?? 0,
				`${key} holds no maps`,
			).toBeGreaterThan(0);
		}
	});
});
