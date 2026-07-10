import { describe, expect, it } from 'vitest';
import { authCore } from '../auth';
import type { AuthSession } from '../auth';

function session(username: string | null): AuthSession {
	return {
		accessToken: 'a',
		refreshToken: 'r',
		expiresAt: null,
		user: { id: 'u1', email: 'e@x.io', username },
	};
}

describe('auth auto-claim', () => {
	it('emits api.auto_claim_username once when signed in without a username', () => {
		const s0 = authCore.initial();
		const r1 = authCore.update(s0, {
			type: 'restored',
			session: session(null),
		});
		expect(r1.effects).toContainEqual({
			type: 'api.auto_claim_username',
			provider: null,
		});
		expect(r1.state.autoClaimAttempted).toBe(true);

		const r2 = authCore.update(r1.state, {
			type: 'session_changed',
			session: session(null),
		});
		expect(r2.effects).not.toContainEqual(
			expect.objectContaining({ type: 'api.auto_claim_username' }),
		);
	});

	it('does not auto-claim when a username already exists', () => {
		const s0 = authCore.initial();
		const r = authCore.update(s0, {
			type: 'restored',
			session: session('bob'),
		});
		expect(r.effects).toEqual([]);
	});

	it('remembers the sign-in provider as the hint', () => {
		let s = authCore.initial();
		s = authCore.update(s, {
			type: 'sign_in_oauth',
			provider: 'github',
		}).state;
		const r = authCore.update(s, {
			type: 'restored',
			session: session(null),
		});
		expect(r.effects).toContainEqual({
			type: 'api.auto_claim_username',
			provider: 'github',
		});
	});
});
