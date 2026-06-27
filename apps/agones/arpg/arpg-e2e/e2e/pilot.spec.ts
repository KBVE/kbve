import { test, expect } from '@playwright/test';
import { signJwt } from './jwt';
import { GameSession, type EntityDelta, type Snapshot } from './ws';

/**
 * Server-authoritative ship piloting (pilot.rs). Drives the JSON wire: the player
 * boards the parked ship near spawn and the snapshot must reflect it for every
 * client — the player carries `piloting = ship_eid`, the ship's `sub` advances out
 * of the parked phase (high nibble 0 → lift/fly).
 */
const cheby = (
	a: { x: number; y: number },
	b: { x: number; y: number },
): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function shipKind(session: GameSession): number {
	const entry = (session.welcome?.registry ?? []).find(
		(k) => k.ref === 'ship',
	);
	if (!entry) throw new Error('ship kind missing from Welcome registry');
	return entry.kind;
}

const shipOf = (snap: Snapshot, kind: number): EntityDelta | undefined =>
	snap.entities.find((e) => e.kind === kind);

test.describe('arpg-server: ship piloting', () => {
	test('the parked ship streams with phase OFF', async () => {
		const jwt = await signJwt({ kbve_username: 'e2e_pilot' });
		const session = await GameSession.open({ jwt, username: 'e2e_pilot' });
		try {
			const kind = shipKind(session);
			const snap = await session.waitFor((s) => !!shipOf(s, kind));
			const ship = shipOf(snap, kind)!;
			expect(ship.tile).toBeDefined();
			// Parked: high nibble of sub (the phase) is 0 (PHASE_OFF).
			expect((ship.sub ?? 0) >> 4).toBe(0);
		} finally {
			session.close();
		}
	});

	test('boarding from out of range is ignored (no piloting flag)', async () => {
		const jwt = await signJwt({ kbve_username: 'e2e_pilot' });
		const session = await GameSession.open({ jwt, username: 'e2e_pilot' });
		try {
			const kind = shipKind(session);
			const snap = await session.waitFor(
				(s) => !!shipOf(s, kind) && !!session.myEntity(s),
			);
			const ship = shipOf(snap, kind)!;
			// Spawn is well away from the ship; board without closing the gap.
			session.enterShip(ship.eid, 2);
			let piloted = false;
			for (let i = 0; i < 40; i++) {
				const s = await session.nextSnapshot();
				const me = session.myEntity(s);
				if (me && (me.piloting ?? 0) !== 0) piloted = true;
			}
			expect(piloted).toBe(false);
		} finally {
			session.close();
		}
	});

	test('walk to the ship, board it, and the snapshot reflects piloting', async () => {
		const jwt = await signJwt({ kbve_username: 'e2e_pilot' });
		const session = await GameSession.open({ jwt, username: 'e2e_pilot' });
		try {
			const kind = shipKind(session);
			const first = await session.waitFor(
				(s) => !!shipOf(s, kind) && !!session.myEntity(s),
			);
			const ship = shipOf(first, kind)!; // parked → tile is stable
			let me = session.myEntity(first)!;

			// Drive the float body toward the ship until within the board range (3).
			let seq = 1;
			let tick = 2;
			for (let i = 0; i < 240 && cheby(me.tile, ship.tile) > 3; i++) {
				const dx = Math.sign(ship.tile.x - me.tile.x);
				const dy = Math.sign(ship.tile.y - me.tile.y);
				session.move(dx, dy, ++seq, true, ++tick);
				const s = await session.nextSnapshot();
				me = session.myEntity(s) ?? me;
			}
			expect(cheby(me.tile, ship.tile)).toBeLessThanOrEqual(3);

			session.enterShip(ship.eid, ++tick);
			const boarded = await session.waitFor(
				(s) => (session.myEntity(s)?.piloting ?? 0) === ship.eid,
				{ frames: 120 },
			);

			// The player flies the ship: piloting points at it, and the ship's phase
			// has advanced out of OFF (lift/fly), encoded in the high nibble of sub.
			expect(session.myEntity(boarded)?.piloting).toBe(ship.eid);
			const shipNow = boarded.entities.find((e) => e.eid === ship.eid);
			if (shipNow)
				expect((shipNow.sub ?? 0) >> 4).toBeGreaterThanOrEqual(1);
		} finally {
			session.close();
		}
	});
});
