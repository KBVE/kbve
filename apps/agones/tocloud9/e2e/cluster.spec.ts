import { describe, expect, it } from 'vitest';
import { redisGet, redisKeys } from './helpers/compose';

const ADDRESS = /^\d{1,3}(\.\d{1,3}){3}:\d+$/;

describe('servers-registry cluster membership', () => {
	it('has at least one worldserver registered under ws:*', () => {
		expect(redisKeys('ws:*').length).toBeGreaterThan(0);
	});

	it('indexes registered worldservers on realm 1', () => {
		expect(redisKeys('realm:1:wss')).toContain('realm:1:wss');
	});

	it('has at least one gateway registered under gw:*', () => {
		expect(redisKeys('gw:*').length).toBeGreaterThan(0);
	});

	it('assigns every map to exactly one worldserver', () => {
		const owners = new Map<number, string>();
		for (const key of redisKeys('ws:*')) {
			const server = JSON.parse(redisGet(key));
			for (const map of server.AssignedMapsToHandle ?? []) {
				expect(
					owners.has(map),
					`map ${map} claimed by both ${owners.get(map)} and ${key}`,
				).toBe(false);
				owners.set(map, key);
			}
		}
		expect(owners.size).toBeGreaterThan(0);
	});

	it.each(redisKeys('ws:*'))(
		'%s advertises routable addresses and holds map assignments',
		(key) => {
			const raw = redisGet(key);
			expect(raw, `${key} has no payload`).not.toBe('');
			const server = JSON.parse(raw);

			// Each worldserver self-registers the address it is reachable on, which is
			// what an Agones Fleet pod would publish from status.podIP. A loopback here
			// means nothing else in the cluster could route to it.
			for (const field of [
				'Address',
				'GRPCAddress',
				'HealthCheckAddr',
			] as const) {
				expect(server[field], `${key}.${field}`).toMatch(ADDRESS);
				expect(
					server[field],
					`${key}.${field} must not be loopback`,
				).not.toMatch(/^127\./);
			}

			expect(server.RealmID).toBe(1);
			expect(Array.isArray(server.AssignedMapsToHandle)).toBe(true);
			expect(server.AssignedMapsToHandle.length).toBeGreaterThan(0);
		},
	);
});
