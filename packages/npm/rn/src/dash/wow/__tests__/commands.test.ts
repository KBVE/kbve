import { describe, it, expect } from 'vitest';
import { WOW_COMMANDS, commandsForRealm } from '../commands';
import {
	className,
	raceName,
	factionOf,
	zoneName,
	mapName,
	realmTypeName,
	nodeRoleFromPod,
	WOW_NODE_ORDER,
} from '../labels';

const DESTRUCTIVE = ['kick', 'ban_account', 'unban_account'];

describe('WOW_COMMANDS', () => {
	it('flags ban, unban and kick as destructive', () => {
		for (const name of DESTRUCTIVE) {
			const cmd = WOW_COMMANDS.find((c) => c.name === name);
			expect(cmd, name).toBeTruthy();
			expect(cmd!.tier, name).toBe('destructive');
		}
	});
	it('read commands take no arguments', () => {
		const reads = WOW_COMMANDS.filter((c) => c.tier === 'read');
		expect(reads.length).toBeGreaterThan(0);
		expect(reads.every((c) => c.args.length === 0)).toBe(true);
	});
	it('every command has a tier, description and template placeholders for its args', () => {
		for (const c of WOW_COMMANDS) {
			expect(['read', 'write', 'destructive']).toContain(c.tier);
			expect(c.description.length).toBeGreaterThan(0);
			c.args.forEach((_, i) =>
				expect(c.template).toContain(`{${i}}`),
			);
		}
	});
	it('covers the required AzerothCore surface', () => {
		const names = WOW_COMMANDS.map((c) => c.name);
		expect(names).toEqual(
			expect.arrayContaining([
				'server_info',
				'server_motd',
				'announce',
				'notify',
				'kick',
				'ban_account',
				'unban_account',
				'account_set_gmlevel',
				'gm_list',
				'reload_config',
			]),
		);
	});
	it('commandsForRealm returns the shared-scope table', () => {
		expect(commandsForRealm('Azeroth')).toHaveLength(WOW_COMMANDS.length);
	});
});

describe('labels', () => {
	it('resolves 3.3.5a classes and races', () => {
		expect(className(6)).toBe('Death Knight');
		expect(className(11)).toBe('Druid');
		expect(raceName(10)).toBe('Blood Elf');
	});
	it('falls back for unknown ids', () => {
		expect(className(99)).toBe('Class 99');
		expect(zoneName(9999)).toBe('Zone 9999');
		expect(mapName(42)).toBe('Map 42');
	});
	it('splits factions', () => {
		expect(factionOf(1)).toBe('Alliance');
		expect(factionOf(11)).toBe('Alliance');
		expect(factionOf(5)).toBe('Horde');
	});
	it('maps realmlist icons', () => {
		expect(realmTypeName(0)).toBe('Normal');
		expect(realmTypeName(1)).toBe('PvP');
	});
	it('derives node role from pod prefix', () => {
		expect(nodeRoleFromPod('tocloud9-worldserver-7d9-x')).toBe('worldserver');
		expect(nodeRoleFromPod('tocloud9-gateway-7d9-x')).toBe('gateway');
		expect(nodeRoleFromPod('prometheus-0')).toBe('unknown');
		expect(WOW_NODE_ORDER).toEqual(['gateway', 'worldserver']);
	});
	it('known maps resolve', () => {
		expect(mapName(571)).toBe('Northrend');
		expect(mapName(530)).toBe('Outland');
	});
});
