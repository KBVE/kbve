import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showWelcomeToast } from './welcome-toast';
import { $auth, AuthPresets, resetAuth, setAuth } from './auth';
import { $toasts } from './toasts';

const SHOWN_KEY = 'kbve:welcome-shown';

beforeEach(() => {
	sessionStorage.clear();
	$toasts.set({});
	$auth.set({
		tone: 'loading',
		flags: AuthPresets.LOADING,
		name: '',
		username: undefined,
		avatar: undefined,
		id: '',
		error: undefined,
	});
});

afterEach(() => {
	vi.useRealTimers();
});

describe('showWelcomeToast', () => {
	it('emits a "Welcome back, <name>" success toast for an authed user', () => {
		setAuth({ tone: 'auth', name: 'Alice' });
		showWelcomeToast();
		const toasts = Object.values($toasts.get());
		expect(toasts).toHaveLength(1);
		expect(toasts[0]).toMatchObject({
			message: 'Welcome back, Alice',
			severity: 'success',
		});
		expect(sessionStorage.getItem(SHOWN_KEY)).toBe('1');
	});

	it('emits a generic info toast for an anon visitor', () => {
		setAuth({ tone: 'anon' });
		showWelcomeToast();
		const toasts = Object.values($toasts.get());
		expect(toasts[0]).toMatchObject({
			message: 'Welcome!',
			severity: 'info',
		});
	});

	it('does not emit twice in the same session', () => {
		setAuth({ tone: 'anon' });
		showWelcomeToast();
		showWelcomeToast();
		expect(Object.values($toasts.get())).toHaveLength(1);
	});

	it('emits when auth resolves after a delay (subscription path)', () => {
		showWelcomeToast();
		expect(Object.values($toasts.get())).toHaveLength(0);

		setAuth({ tone: 'auth', name: 'Bob' });
		const toasts = Object.values($toasts.get());
		expect(toasts).toHaveLength(1);
		expect(toasts[0]).toMatchObject({ message: 'Welcome back, Bob' });
	});

	it('falls back to a generic toast after the 10s timeout when auth never resolves', () => {
		vi.useFakeTimers();
		showWelcomeToast();
		expect(Object.values($toasts.get())).toHaveLength(0);

		vi.advanceTimersByTime(10_000);
		const toasts = Object.values($toasts.get());
		expect(toasts).toHaveLength(1);
		expect(toasts[0]).toMatchObject({
			message: 'Welcome!',
			severity: 'info',
		});
	});

	it('marks shown without emitting when tone is error', () => {
		setAuth({ tone: 'error', error: 'boom' });
		showWelcomeToast();
		expect(Object.values($toasts.get())).toHaveLength(0);
		expect(sessionStorage.getItem(SHOWN_KEY)).toBe('1');
	});

	it('treats sessionStorage failures as not-shown without throwing', () => {
		const original = Storage.prototype.getItem;
		Storage.prototype.getItem = () => {
			throw new Error('private mode');
		};
		try {
			expect(() => {
				resetAuth();
				showWelcomeToast();
			}).not.toThrow();
		} finally {
			Storage.prototype.getItem = original;
		}
	});
});
