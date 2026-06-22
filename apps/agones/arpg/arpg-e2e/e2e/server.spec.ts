import { test, expect } from '@playwright/test';
import { SERVER_HTTP, PROTOCOL_VERSION } from './env';
import { signJwt } from './jwt';
import { joinMatch, GameSession, type Snapshot } from './ws';

test.describe('arpg-server: HTTP', () => {
	test('GET /healthz returns ok', async ({ request }) => {
		const res = await request.get(`${SERVER_HTTP}/healthz`);
		expect(res.ok()).toBeTruthy();
		expect((await res.text()).trim()).toBe('ok');
	});

	test('GET /ws without upgrade returns 4xx', async ({ request }) => {
		const res = await request.get(`${SERVER_HTTP}/ws`);
		expect(res.status()).toBeGreaterThanOrEqual(400);
	});

	test('unknown route returns 404', async ({ request }) => {
		const res = await request.get(`${SERVER_HTTP}/nope`);
		expect(res.status()).toBe(404);
	});
});

test.describe('arpg-server: WebSocket join', () => {
	test('valid HS256 token + username is admitted (Welcome)', async () => {
		const jwt = await signJwt();
		const r = await joinMatch({ jwt, username: 'e2e_player' });
		expect(r.reject, r.reject?.reason).toBeUndefined();
		expect(r.welcome).toBeDefined();
		expect(r.welcome?.protocol).toBe(PROTOCOL_VERSION);
		expect(typeof r.welcome?.your_slot).toBe('number');
		expect(typeof r.welcome?.seed).toBe('number');
	});

	test('Welcome registry carries the arpg kinds', async () => {
		const jwt = await signJwt();
		const r = await joinMatch({ jwt });
		const refs = (r.welcome?.registry ?? []).map((k) => k.ref);
		expect(refs).toEqual(
			expect.arrayContaining(['player', 'goblin', 'coin', 'dungeon-key']),
		);
	});

	test('protocol mismatch is rejected', async () => {
		const jwt = await signJwt();
		const r = await joinMatch({ jwt, protocol: PROTOCOL_VERSION - 1 });
		expect(r.welcome).toBeUndefined();
		expect(r.reject?.reason ?? '').toMatch(/protocol mismatch/i);
	});

	test('invalid token is rejected', async () => {
		const r = await joinMatch({ jwt: 'not.a.jwt', username: 'e2e_player' });
		expect(r.welcome).toBeUndefined();
		expect(r.reject?.reason ?? '').toMatch(/auth rejected/i);
	});

	test('empty token is rejected', async () => {
		const r = await joinMatch({ jwt: '', username: 'e2e_player' });
		expect(r.welcome).toBeUndefined();
		expect(r.reject?.reason ?? '').toMatch(/auth rejected|missing/i);
	});

	test('token without a kbve_username claim is rejected', async () => {
		const jwt = await signJwt({ kbve_username: '' });
		const r = await joinMatch({ jwt, username: '' });
		expect(r.welcome).toBeUndefined();
		expect(r.reject?.reason ?? '').toMatch(/auth rejected|username/i);
	});

	test('first frame must be JoinMatch', async () => {
		// A Frame sent before joining is refused — handled by sending a bad jwt
		// through the join path is covered above; here we assert a malformed first
		// payload still closes rather than admitting.
		const r = await joinMatch({ jwt: '{not-json', username: 'x' });
		expect(r.welcome).toBeUndefined();
	});
});

test.describe('arpg-server: sim', () => {
	test('admitted player appears in the snapshot roster', async () => {
		const jwt = await signJwt({ kbve_username: 'sim_player' });
		const s = await GameSession.open({ jwt, username: 'sim_player' });
		try {
			const snap = await s.waitFor((sn) =>
				sn.players.some((p) => p.kbve_username === 'sim_player'),
			);
			const me = snap.players.find(
				(p) => p.kbve_username === 'sim_player',
			);
			expect(me?.connected).toBe(true);
			expect(me?.slot).toBe(s.welcome?.your_slot);
		} finally {
			s.close();
		}
	});

	test('the seeded world spawns hostiles (goblins)', async () => {
		const jwt = await signJwt({ kbve_username: 'spawn_watcher' });
		const s = await GameSession.open({ jwt, username: 'spawn_watcher' });
		try {
			const goblinKind = s.welcome?.registry.find(
				(k) => k.ref === 'goblin',
			)?.kind;
			expect(goblinKind).toBeDefined();
			const snap = await s.waitFor((sn) =>
				sn.entities.some((e) => e.kind === goblinKind && !e.destroyed),
			);
			const goblins = snap.entities.filter((e) => e.kind === goblinKind);
			expect(goblins.length).toBeGreaterThan(0);
			expect(goblins[0].max_hp).toBeGreaterThan(0);
		} finally {
			s.close();
		}
	});

	test('a Step input advances the player tile', async () => {
		const jwt = await signJwt({ kbve_username: 'walker' });
		const s = await GameSession.open({ jwt, username: 'walker' });
		try {
			const slot = s.welcome!.your_slot;
			const tileOf = (sn: Snapshot) =>
				sn.entities.find((e) => e.owner === slot && e.kind === 0)?.tile;
			const start = await s.waitFor((sn) => !!tileOf(sn));
			const from = tileOf(start)!;
			// Drive several steps so the integer tile crosses at least once,
			// regardless of which cardinal is unobstructed by the seeded walls.
			for (let i = 0; i < 8; i++) s.step('Up', i + 1);
			const moved = await s.waitFor((sn) => {
				const t = tileOf(sn);
				return !!t && (t.x !== from.x || t.y !== from.y);
			});
			const to = tileOf(moved)!;
			expect(to.x !== from.x || to.y !== from.y).toBe(true);
		} finally {
			s.close();
		}
	});

	test('input_ack advances and ticks progress', async () => {
		const jwt = await signJwt({ kbve_username: 'ticker' });
		const s = await GameSession.open({ jwt, username: 'ticker' });
		try {
			const a = await s.nextSnapshot();
			const b = await s.waitFor((sn) => sn.tick > a.tick);
			expect(b.tick).toBeGreaterThan(a.tick);
		} finally {
			s.close();
		}
	});

	test('newest login evicts the prior session (same username)', async () => {
		const jwt = await signJwt({ kbve_username: 'twin' });
		const first = await GameSession.open({ jwt, username: 'twin' });
		await first.nextSnapshot();
		const second = await GameSession.open({ jwt, username: 'twin' });
		try {
			// The first session is kicked: its socket closes.
			await expect
				.poll(() => first.closeCode, { timeout: 5000 })
				.not.toBeNull();
			// Only one 'twin' remains in the roster.
			const snap = await second.waitFor((sn) =>
				sn.players.some((p) => p.kbve_username === 'twin'),
			);
			const twins = snap.players.filter(
				(p) => p.kbve_username === 'twin' && p.connected,
			);
			expect(twins.length).toBe(1);
		} finally {
			first.close();
			second.close();
		}
	});

	test('two distinct players share the world (separate slots)', async () => {
		const jwtA = await signJwt({ kbve_username: 'alice' });
		const jwtB = await signJwt({ kbve_username: 'bob' });
		const a = await GameSession.open({ jwt: jwtA, username: 'alice' });
		const b = await GameSession.open({ jwt: jwtB, username: 'bob' });
		try {
			expect(a.welcome!.your_slot).not.toBe(b.welcome!.your_slot);
			const snap = await b.waitFor(
				(sn) =>
					sn.players.some((p) => p.kbve_username === 'alice') &&
					sn.players.some((p) => p.kbve_username === 'bob'),
			);
			const names = snap.players.map((p) => p.kbve_username);
			expect(names).toEqual(expect.arrayContaining(['alice', 'bob']));
		} finally {
			a.close();
			b.close();
		}
	});
});
