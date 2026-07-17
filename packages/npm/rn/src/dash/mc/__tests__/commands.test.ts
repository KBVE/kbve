import { describe, it, expect } from 'vitest';
import { MC_COMMANDS, commandsForServer } from '../commands';
import { serverMeta, MC_SERVER_ORDER } from '../labels';

describe('commandsForServer', () => {
	it('velocity gets velocity + shared scoped commands only', () => {
		const cmds = commandsForServer('velocity');
		expect(cmds.length).toBeGreaterThan(0);
		expect(cmds.every((c) => c.scope !== 'backend')).toBe(true);
		expect(cmds.some((c) => c.name === 'glist')).toBe(true);
		expect(cmds.some((c) => c.name === 'list')).toBe(false);
	});
	it('backends get backend + shared scoped commands only', () => {
		const cmds = commandsForServer('survival');
		expect(cmds.every((c) => c.scope !== 'velocity')).toBe(true);
		expect(cmds.some((c) => c.name === 'ban')).toBe(true);
		expect(cmds.some((c) => c.name === 'alert')).toBe(false);
	});
	it('every command has a tier and description', () => {
		for (const c of MC_COMMANDS) {
			expect(['read', 'write', 'destructive']).toContain(c.tier);
			expect(c.description.length).toBeGreaterThan(0);
		}
	});
});

describe('labels', () => {
	it('known servers have labels and roles', () => {
		expect(serverMeta('velocity').label).toBe('Velocity Proxy');
		expect(serverMeta('lobby').role.length).toBeGreaterThan(0);
	});
	it('unknown server falls back to its name', () => {
		expect(serverMeta('creative')).toEqual({ label: 'creative', role: '' });
	});
	it('order is velocity, lobby, survival', () => {
		expect(MC_SERVER_ORDER).toEqual(['velocity', 'lobby', 'survival']);
	});
});
