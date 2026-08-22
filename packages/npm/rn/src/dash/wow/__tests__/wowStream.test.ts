import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	wowCommand,
	mapRealms,
	mapRealmCounts,
	mapCharacters,
	mapAccounts,
	isNotProvisioned,
	WOW_NOT_PROVISIONED,
} from '../wowStream';
import type { RawRealmStatus, RawOnlineCharacters, RawAccounts } from '../wowStream';

const signal = new AbortController().signal;

const realmRaw: RawRealmStatus = {
	realms: [
		{
			id: 1,
			name: 'Azeroth',
			address: '10.0.0.5',
			port: 8085,
			icon: 1,
			timezone: 8,
			population: 0,
		},
	],
	online: 12,
	accounts: 340,
	banned_accounts: 4,
};

describe('mapRealms / mapRealmCounts', () => {
	it('maps realm rows and counts', () => {
		expect(mapRealms(realmRaw)[0]).toMatchObject({
			id: 1,
			name: 'Azeroth',
			port: 8085,
			icon: 1,
		});
		expect(mapRealmCounts(realmRaw)).toEqual({
			online: 12,
			accounts: 340,
			bannedAccounts: 4,
		});
	});
	it('tolerates a missing realms array', () => {
		expect(mapRealms({} as RawRealmStatus)).toEqual([]);
		expect(mapRealmCounts({} as RawRealmStatus)).toEqual({
			online: 0,
			accounts: 0,
			bannedAccounts: 0,
		});
	});
});

describe('mapCharacters', () => {
	const raw: RawOnlineCharacters = {
		characters: [
			{
				guid: 2,
				name: 'Bob',
				level: 40,
				class_id: 1,
				race_id: 5,
				gender: 0,
				zone_id: 1497,
				map_id: 0,
				account_id: 9,
				account_name: 'BOBACC',
			},
			{
				guid: 1,
				name: 'Alice',
				level: 80,
				class_id: 6,
				race_id: 1,
				gender: 1,
				zone_id: 4395,
				map_id: 571,
				account_id: 8,
				account_name: 'ALICEACC',
			},
		],
	};
	it('snake_case → camelCase and sorts by level desc', () => {
		const chars = mapCharacters(raw);
		expect(chars.map((c) => c.name)).toEqual(['Alice', 'Bob']);
		expect(chars[0]).toMatchObject({
			classId: 6,
			raceId: 1,
			zoneId: 4395,
			mapId: 571,
			accountName: 'ALICEACC',
		});
	});
	it('handles an empty payload', () => {
		expect(mapCharacters({} as RawOnlineCharacters)).toEqual([]);
	});
});

describe('mapAccounts', () => {
	it('coerces 0/1 flags to booleans', () => {
		const raw: RawAccounts = {
			accounts: [
				{
					id: 1,
					username: 'ALICE',
					email: 'a@b.c',
					joindate: '2024-01-01',
					last_ip: '1.2.3.4',
					last_login: '2024-02-01',
					expansion: 2,
					online: 1,
					gmlevel: 3,
					banned: 0,
					ban_reason: null,
				},
			],
			total: 1,
		};
		const [a] = mapAccounts(raw);
		expect(a.online).toBe(true);
		expect(a.banned).toBe(false);
		expect(a.lastIp).toBe('1.2.3.4');
	});
});

describe('wowCommand', () => {
	beforeEach(() => {
		global.fetch = vi.fn();
	});

	it('posts { command, ...args } to the wow edge function', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => realmRaw,
		});
		const out = await wowCommand<RawRealmStatus>(
			'https://x',
			'tok',
			'staff.realm_status',
			{},
			signal,
		);
		expect(out.online).toBe(12);
		const [url, init] = (global.fetch as any).mock.calls[0];
		expect(url).toBe('https://x/functions/v1/wow');
		expect(init.method).toBe('POST');
		expect(init.headers.Authorization).toBe('Bearer tok');
		expect(JSON.parse(init.body)).toEqual({ command: 'staff.realm_status' });
	});

	it('passes args through alongside the command', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ accounts: [], total: 0 }),
		});
		await wowCommand('', 'tok', 'staff.accounts', { limit: 10, search: 'al' }, signal);
		expect(JSON.parse((global.fetch as any).mock.calls[0][1].body)).toEqual({
			command: 'staff.accounts',
			limit: 10,
			search: 'al',
		});
	});

	it('503 becomes the friendly not-provisioned error', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 503,
			text: async () => 'no mysql',
		});
		await expect(
			wowCommand('', 'tok', 'staff.realm_status', {}, signal),
		).rejects.toThrow(WOW_NOT_PROVISIONED);
	});

	it('other non-OK responses surface their error body, not the provisioning state', async () => {
		(global.fetch as any).mockResolvedValue({
			ok: false,
			status: 403,
			text: async () => JSON.stringify({ error: 'staff only' }),
		});
		const err = await wowCommand('', 'tok', 'staff.accounts', {}, signal).catch(
			(e: Error) => e,
		);
		expect(String(err)).toContain('staff only');
		expect(isNotProvisioned(String(err))).toBe(false);
	});

	it('refuses without a token and never hits the network', async () => {
		await expect(
			wowCommand('', null, 'staff.realm_status', {}, signal),
		).rejects.toThrow('Not signed in');
		expect(global.fetch).not.toHaveBeenCalled();
	});
});

describe('isNotProvisioned', () => {
	it('matches only the provisioning sentinel', () => {
		expect(isNotProvisioned(WOW_NOT_PROVISIONED)).toBe(true);
		expect(isNotProvisioned(`wow:x → ${WOW_NOT_PROVISIONED}`)).toBe(true);
		expect(isNotProvisioned('HTTP 500')).toBe(false);
		expect(isNotProvisioned(null)).toBe(false);
	});
});
