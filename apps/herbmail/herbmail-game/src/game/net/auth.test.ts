import { describe, expect, it } from 'vitest';
import { usernameFromToken } from '@kbve/laser';

// Builds a JWT-shaped string. Only the claims segment is ever read — nothing
// here verifies a signature, so the header and signature are filler.
function tokenWith(claims: Record<string, unknown>): string {
	const b64 = (o: unknown) =>
		btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_');
	return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.sig`;
}

describe('multiplayer auth plumbing', () => {
	// The root @kbve/laser barrel resolves only through nxViteTsPaths for
	// build/dev; vitest needs an explicit alias, and the game had one for every
	// subpath but not the root. This asserts the import actually works.
	it('resolves the root @kbve/laser barrel', () => {
		expect(typeof usernameFromToken).toBe('function');
	});

	it('reads the kbve_username claim the server keys players on', () => {
		expect(
			usernameFromToken(tokenWith({ kbve_username: 'herbdude' })),
		).toBe('herbdude');
	});

	// A signed-in player with no kbve_username must be sent to the username
	// setup step, not connected — the claim is injected by the GoTrue
	// custom-access-token hook and is absent until the player picks one.
	it('reports an empty username rather than throwing when the claim is absent', () => {
		expect(usernameFromToken(tokenWith({ sub: 'abc' }))).toBe('');
	});

	it('survives a malformed token instead of breaking the menu', () => {
		expect(usernameFromToken('not-a-jwt')).toBe('');
		expect(usernameFromToken('')).toBe('');
	});

	// Importing the auth module must not construct a Supabase client or touch
	// the network: single player has to boot with no session and works offline
	// in the standalone build.
	it('does not pull supabase in merely by being imported', async () => {
		const mod = await import('./auth');
		expect(typeof mod.multiplayerGate).toBe('function');
		expect(mod.netConfig.get()).toBeNull();
	});
});

describe('guest players', () => {
	it('prefixes guest names so they cannot read as an account name', async () => {
		const { guestUsername, GUEST_PREFIX } = await import('./auth');
		expect(guestUsername().startsWith(GUEST_PREFIX)).toBe(true);
	});

	it('keeps the same guest name across calls within a session', async () => {
		const { guestUsername } = await import('./auth');
		expect(guestUsername()).toBe(guestUsername());
	});

	it('connects a signed-out player as a guest when guests are allowed', async () => {
		const { resolveNetConfig, GUEST_PREFIX } = await import('./auth');
		const { config, gate } = await resolveNetConfig(true);
		expect(gate).toBeNull();
		expect(config?.jwt).toBe('');
		expect(config?.username.startsWith(GUEST_PREFIX)).toBe(true);
		expect(config?.wsUrl).toBeTruthy();
	});

	it('still reports signed-out when guests are not allowed', async () => {
		const { resolveNetConfig } = await import('./auth');
		const { config, gate } = await resolveNetConfig(false);
		expect(config).toBeNull();
		expect(gate).toBe('signed-out');
	});
});
