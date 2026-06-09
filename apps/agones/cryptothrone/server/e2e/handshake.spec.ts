import { describe, it, expect } from 'vitest';
import { joinAndAwaitSnapshot } from './helpers/ws';

describe('cryptothrone-server WS handshake (JSON wire)', () => {
	it('admits a player and streams the CloudCity world snapshot', async () => {
		const { welcome, snapshot } = await joinAndAwaitSnapshot();

		expect(welcome.protocol).toBe(1);
		expect(typeof welcome.your_slot).toBe('number');

		expect(Array.isArray(snapshot.entities)).toBe(true);
		const kinds = new Set(snapshot.entities.map((e) => e.kind));
		expect(kinds.has(1)).toBe(true); // monk
		expect(kinds.has(2)).toBe(true); // bird
		expect(snapshot.entities.length).toBeGreaterThanOrEqual(11);
	}, 20_000);
});
