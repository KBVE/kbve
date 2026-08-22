import { describe, it, expect } from 'vitest';
import {
	WOW_COMMANDS,
	commandsByScope,
	commandsForRealm,
	NODE_SCOPE_NOTE,
	NODE_SCOPE_DETAIL,
} from '../commands';
import { soapResultCaveat } from '../soapExec';
import type { SoapExecResponse } from '../soapExec';

describe('command scope table', () => {
	it('shared-DB writes are realm-scoped', () => {
		expect(commandsByScope('realm').map((c) => c.name).sort()).toEqual([
			'account_set_gmlevel',
			'ban_account',
			'unban_account',
		]);
	});

	it('everything reaching live sessions is node-scoped', () => {
		expect(commandsByScope('node').map((c) => c.name).sort()).toEqual(
			[
				'announce',
				'gm_list',
				'kick',
				'notify',
				'reload_config',
				'server_info',
				'server_motd',
			].sort(),
		);
	});

	it('every command declares a scope', () => {
		expect(
			WOW_COMMANDS.every((c) => c.scope === 'realm' || c.scope === 'node'),
		).toBe(true);
	});

	it('node-scoped commands carry the picker note so the caveat shows before running', () => {
		for (const c of commandsByScope('node')) {
			expect(c.note, c.name).toBe(NODE_SCOPE_NOTE);
			expect(c.noteDetail, c.name).toBe(NODE_SCOPE_DETAIL);
		}
	});

	it('realm-scoped commands carry no note', () => {
		for (const c of commandsByScope('realm')) {
			expect(c.note, c.name).toBeUndefined();
		}
	});

	it('fleet lifecycle commands are gone from the client allowlist', () => {
		const names = WOW_COMMANDS.map((c) => c.name);
		expect(names).not.toContain('server_shutdown');
		expect(names).not.toContain('server_restart');
		expect(commandsForRealm('Azeroth')).toHaveLength(WOW_COMMANDS.length);
	});
});

describe('soapResultCaveat', () => {
	const res = (over: Partial<SoapExecResponse>): SoapExecResponse => ({
		ok: true,
		output: 'done',
		latency_ms: 4,
		...over,
	});

	it('qualifies a successful node-scoped result', () => {
		expect(soapResultCaveat(res({ scope: 'node' }))).toBe(NODE_SCOPE_DETAIL);
	});

	it('qualifies a failed node-scoped result too — a miss may just be the wrong node', () => {
		expect(
			soapResultCaveat(
				res({ ok: false, output: 'Player not found', scope: 'node' }),
			),
		).toBe(NODE_SCOPE_DETAIL);
	});

	it('leaves realm-scoped and scope-less results unqualified', () => {
		expect(soapResultCaveat(res({ scope: 'realm' }))).toBeNull();
		expect(soapResultCaveat(res({}))).toBeNull();
	});
});
