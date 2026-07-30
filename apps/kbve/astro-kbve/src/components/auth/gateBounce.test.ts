import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGateRedirect } from './gateBounce';

const q = (value: string) => `?redirect_to=${encodeURIComponent(value)}`;

afterEach(() => {
	vi.restoreAllMocks();
});

describe('readGateRedirect', () => {
	it('accepts an https target on a kbve.com subdomain', () => {
		expect(
			readGateRedirect(q('https://supabase.kbve.com/project/default')),
		).toBe('https://supabase.kbve.com/project/default');
	});

	it('accepts the apex host', () => {
		expect(readGateRedirect(q('https://kbve.com/x'))).toBe(
			'https://kbve.com/x',
		);
	});

	it('preserves the query on a deep-link target', () => {
		expect(
			readGateRedirect(
				q(
					'https://supabase.kbve.com/project/default/sql?schema=public',
				),
			),
		).toBe('https://supabase.kbve.com/project/default/sql?schema=public');
	});

	it('returns null when the param is absent', () => {
		expect(readGateRedirect('')).toBeNull();
		expect(readGateRedirect('?other=1')).toBeNull();
	});

	it.each([
		['plain http', 'http://supabase.kbve.com/project/default'],
		['an internal service host', 'http://studio-gate:5678/project/default'],
		['a foreign origin', 'https://evil.com/steal'],
		['a suffix lookalike', 'https://notkbve.com/steal'],
		['a prefix lookalike', 'https://kbve.com.evil.com/steal'],
		['a path-only value', '/project/default'],
		['a javascript scheme', 'javascript:alert(1)'],
		['garbage', 'not a url'],
	])('rejects %s', (_label, value) => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(readGateRedirect(q(value))).toBeNull();
		expect(warn).toHaveBeenCalledOnce();
	});

	it('warns with the rejected value so the cause is visible', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		readGateRedirect(q('http://studio-gate:5678/project/default'));
		expect(warn.mock.calls[0][0]).toContain('http://studio-gate:5678');
		expect(warn.mock.calls[0][0]).toContain('not https');
	});

	it('does not warn when there is nothing to redirect to', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		readGateRedirect('');
		expect(warn).not.toHaveBeenCalled();
	});
});
