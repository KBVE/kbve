import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
	parseUsernameFromHref,
	pickAvatar,
	pickDisplayName,
	connectedProviders,
	buildTooltipHtml,
	type UserProfileResponse,
} from './userTooltipService';

describe('parseUsernameFromHref', () => {
	it('parses relative profile links', () => {
		expect(parseUsernameFromHref('/@h0lybyte')).toBe('h0lybyte');
	});

	it('stops at path/query/fragment boundaries', () => {
		expect(parseUsernameFromHref('/@h0lybyte/threads')).toBe('h0lybyte');
		expect(parseUsernameFromHref('/@h0lybyte?tab=1')).toBe('h0lybyte');
		expect(parseUsernameFromHref('/@h0lybyte#top')).toBe('h0lybyte');
	});

	it('parses absolute profile links', () => {
		expect(parseUsernameFromHref('https://kbve.com/@al_1')).toBe('al_1');
	});

	it('rejects non-profile hrefs', () => {
		expect(parseUsernameFromHref('/forum/t/hello')).toBeNull();
		expect(parseUsernameFromHref('/docs')).toBeNull();
		expect(parseUsernameFromHref('')).toBeNull();
		expect(parseUsernameFromHref(null)).toBeNull();
		expect(parseUsernameFromHref(undefined)).toBeNull();
	});

	it('rejects empty or oversized usernames', () => {
		expect(parseUsernameFromHref('/@')).toBeNull();
		expect(parseUsernameFromHref('/@' + 'a'.repeat(65))).toBeNull();
	});

	it('rejects disallowed characters', () => {
		expect(parseUsernameFromHref('/@bad name')).toBeNull();
		expect(parseUsernameFromHref('/@bad.name')).toBeNull();
	});

	it('round-trips any valid username', () => {
		fc.assert(
			fc.property(
				fc
					.stringMatching(/^[A-Za-z0-9_-]{1,64}$/)
					.filter((s) => s.length >= 1),
				(name) => {
					expect(parseUsernameFromHref(`/@${name}`)).toBe(name);
					expect(parseUsernameFromHref(`/@${name}/x`)).toBe(name);
				},
			),
		);
	});
});

describe('pickAvatar / pickDisplayName / connectedProviders', () => {
	it('prefers discord, then github, then twitch avatar', () => {
		expect(
			pickAvatar({
				username: 'a',
				discord: { avatar_url: 'd' },
				github: { avatar_url: 'g' },
			}),
		).toBe('d');
		expect(
			pickAvatar({ username: 'a', github: { avatar_url: 'g' } }),
		).toBe('g');
		expect(
			pickAvatar({ username: 'a', twitch: { avatar_url: 't' } }),
		).toBe('t');
		expect(pickAvatar({ username: 'a' })).toBeNull();
	});

	it('falls back to @username for display name', () => {
		expect(pickDisplayName({ username: 'a' })).toBe('@a');
		expect(
			pickDisplayName({ username: 'a', github: { username: 'Gh' } }),
		).toBe('Gh');
	});

	it('derives providers when list absent', () => {
		expect(
			connectedProviders({ username: 'a', discord: {}, twitch: {} }),
		).toEqual(['discord', 'twitch']);
	});

	it('honors explicit connected_providers list', () => {
		expect(
			connectedProviders({
				username: 'a',
				connected_providers: ['github'],
			}),
		).toEqual(['github']);
	});
});

describe('buildTooltipHtml', () => {
	const base: UserProfileResponse = {
		username: 'h0lybyte',
		discord: { username: 'Al', avatar_url: 'https://cdn/a.png' },
		connected_providers: ['discord'],
	};

	it('renders avatar image and display name', () => {
		const html = buildTooltipHtml(base);
		expect(html).toContain('https://cdn/a.png');
		expect(html).toContain('Al');
		expect(html).toContain('@h0lybyte');
		expect(html).toContain('kut__badge--discord');
	});

	it('renders initial-letter fallback with no avatar', () => {
		const html = buildTooltipHtml({ username: 'zed' });
		expect(html).not.toContain('<img');
		expect(html).toContain('Z');
	});

	it('shows twitch live marker', () => {
		const html = buildTooltipHtml({
			username: 'a',
			twitch: { username: 't', is_live: true },
			connected_providers: ['twitch'],
		});
		expect(html).toContain('kut__live');
		expect(html).toContain('Live');
	});

	it('shows guild member badge', () => {
		const html = buildTooltipHtml({
			username: 'a',
			discord: { username: 'd', is_guild_member: true },
			connected_providers: ['discord'],
		});
		expect(html).toContain('kut__badge--guild');
	});

	it('escapes hostile provider values', () => {
		const html = buildTooltipHtml({
			username: 'a',
			github: { username: '<script>x</script>', avatar_url: '"onerror="y' },
			connected_providers: ['github'],
		});
		expect(html).not.toContain('<script>x</script>');
		expect(html).toContain('&lt;script&gt;');
		expect(html).not.toContain('"onerror="y"');
	});
});
