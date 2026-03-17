import { describe, it, expect, beforeEach } from 'vitest';
import { $auth, setAuth, resetAuth } from './auth';

beforeEach(() => {
	resetAuth();
	// resetAuth sets tone to 'anon', restore to default 'loading' for clean tests
	$auth.set({
		tone: 'loading',
		name: '',
		avatar: undefined,
		id: '',
		error: undefined,
	});
});

describe('Auth state', () => {
	it('starts with loading tone', () => {
		expect($auth.get().tone).toBe('loading');
	});

	it('setAuth merges partial state', () => {
		setAuth({ tone: 'auth', name: 'Alice', id: 'u1' });

		const state = $auth.get();
		expect(state.tone).toBe('auth');
		expect(state.name).toBe('Alice');
		expect(state.id).toBe('u1');
		expect(state.avatar).toBeUndefined();
	});

	it('setAuth preserves existing fields', () => {
		setAuth({ tone: 'auth', name: 'Alice', id: 'u1' });
		setAuth({ avatar: 'https://example.com/avatar.png' });

		const state = $auth.get();
		expect(state.name).toBe('Alice');
		expect(state.avatar).toBe('https://example.com/avatar.png');
	});

	it('setAuth can set error state', () => {
		setAuth({ tone: 'error', error: 'Token expired' });

		expect($auth.get().tone).toBe('error');
		expect($auth.get().error).toBe('Token expired');
	});

	it('resetAuth clears to anon defaults', () => {
		setAuth({ tone: 'auth', name: 'Alice', id: 'u1', avatar: 'img.png' });
		resetAuth();

		const state = $auth.get();
		expect(state.tone).toBe('anon');
		expect(state.name).toBe('');
		expect(state.id).toBe('');
		expect(state.avatar).toBeUndefined();
		expect(state.error).toBeUndefined();
	});
});
