// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bounceToGate } from './gateBounce';

let replace: ReturnType<typeof vi.fn>;

beforeEach(() => {
	replace = vi.fn();
	Object.defineProperty(window, 'location', {
		configurable: true,
		value: { ...window.location, replace },
	});
});

describe('bounceToGate', () => {
	it('appends the access token and navigates', () => {
		expect(
			bounceToGate('https://supabase.kbve.com/project/default', 'jwt123'),
		).toBe(true);
		expect(replace).toHaveBeenCalledWith(
			'https://supabase.kbve.com/project/default?access_token=jwt123',
		);
	});

	it('keeps an existing deep-link query alongside the token', () => {
		bounceToGate(
			'https://supabase.kbve.com/project/default/sql?schema=public',
			'jwt123',
		);
		expect(replace).toHaveBeenCalledWith(
			'https://supabase.kbve.com/project/default/sql?schema=public&access_token=jwt123',
		);
	});

	it('overwrites a token already present rather than duplicating it', () => {
		bounceToGate('https://supabase.kbve.com/x?access_token=stale', 'fresh');
		expect(replace).toHaveBeenCalledWith(
			'https://supabase.kbve.com/x?access_token=fresh',
		);
	});

	it.each([
		['a foreign origin', 'https://evil.com/steal'],
		['a prefix lookalike', 'https://kbve.com.evil.com/steal'],
		['garbage', 'not a url'],
	])('refuses to hand the token to %s', (_label, target) => {
		expect(bounceToGate(target, 'jwt123')).toBe(false);
		expect(replace).not.toHaveBeenCalled();
	});

	it('is a no-op without a target or a token', () => {
		expect(bounceToGate('', 'jwt123')).toBe(false);
		expect(bounceToGate('https://supabase.kbve.com/x', '')).toBe(false);
		expect(replace).not.toHaveBeenCalled();
	});
});
