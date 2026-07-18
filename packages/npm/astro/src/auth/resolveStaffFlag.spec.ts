import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	$auth,
	AuthFlags,
	AuthPresets,
	hasAuthFlag,
	clearStaffPermsCache,
	type SupabaseGateway,
} from '@kbve/droid';
import { resolveStaffFlag } from './bootAuth';

const URL = 'https://supabase.test';
const KEY = 'anon-key';
const USER = 'user-1';

function authState(id = USER) {
	$auth.set({
		tone: 'auth',
		flags: AuthPresets.USER,
		name: 'n',
		username: undefined,
		avatar: undefined,
		id,
		error: undefined,
	});
}

function gatewayWithToken(
	tokenSequence: Array<string | null>,
): SupabaseGateway {
	let i = 0;
	return {
		getSession: vi.fn(async () => {
			const token = tokenSequence[Math.min(i, tokenSequence.length - 1)];
			i++;
			return token ? { session: { access_token: token } } : null;
		}),
	} as unknown as SupabaseGateway;
}

function mockRpc(value: unknown, ok = true) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok,
			status: ok ? 200 : 403,
			json: async () => value,
		})),
	);
}

beforeEach(() => {
	vi.useFakeTimers();
	clearStaffPermsCache();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
	vi.runOnlyPendingTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('resolveStaffFlag', () => {
	it('sets STAFF flag when RPC returns a non-zero bitmask', async () => {
		authState();
		mockRpc(0x40000001);
		const gw = gatewayWithToken(['tok']);
		await resolveStaffFlag(gw, URL, KEY);
		expect(hasAuthFlag($auth.get().flags, AuthFlags.STAFF)).toBe(true);
	});

	it('does not set STAFF when RPC returns 0', async () => {
		authState();
		mockRpc(0);
		const gw = gatewayWithToken(['tok']);
		await resolveStaffFlag(gw, URL, KEY);
		expect(hasAuthFlag($auth.get().flags, AuthFlags.STAFF)).toBe(false);
	});

	it('retries the session until a token hydrates (race fix)', async () => {
		authState();
		mockRpc(0x40000001);
		const gw = gatewayWithToken([null, null, 'tok']);
		const p = resolveStaffFlag(gw, URL, KEY);
		await vi.advanceTimersByTimeAsync(1000);
		await p;
		expect(gw.getSession).toHaveBeenCalledTimes(3);
		expect(hasAuthFlag($auth.get().flags, AuthFlags.STAFF)).toBe(true);
	});

	it('gives up after exhausting attempts when no token arrives', async () => {
		authState();
		mockRpc(0x40000001);
		const gw = gatewayWithToken([null]);
		const p = resolveStaffFlag(gw, URL, KEY);
		await vi.advanceTimersByTimeAsync(3000);
		await p;
		expect(fetch).not.toHaveBeenCalled();
		expect(hasAuthFlag($auth.get().flags, AuthFlags.STAFF)).toBe(false);
	});

	it('does not clobber a different user that signed in mid-flight', async () => {
		authState('user-1');
		mockRpc(0x40000001);
		const gw = gatewayWithToken([null, 'tok']);
		const p = resolveStaffFlag(gw, URL, KEY);
		// Another user signs in while the RPC is in flight.
		authState('user-2');
		await vi.advanceTimersByTimeAsync(1000);
		await p;
		const state = $auth.get();
		expect(state.id).toBe('user-2');
		expect(hasAuthFlag(state.flags, AuthFlags.STAFF)).toBe(false);
	});
});
