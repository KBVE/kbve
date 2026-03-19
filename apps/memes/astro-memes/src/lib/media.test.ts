import { describe, it, expect } from 'vitest';
import {
	parseYouTubeUrl,
	youTubeThumbnail,
	youTubeEmbedUrl,
	resolveMediaKind,
	gridThumbnail,
	showPlayOverlay,
} from './media';

// ── parseYouTubeUrl ──────────────────────────────────────────────────

describe('parseYouTubeUrl', () => {
	it('parses youtube.com/watch?v= URLs', () => {
		const result = parseYouTubeUrl(
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		);
		expect(result).toEqual({ videoId: 'dQw4w9WgXcQ' });
	});

	it('parses youtube.com/watch with extra params', () => {
		const result = parseYouTubeUrl(
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLrAXtmE',
		);
		expect(result?.videoId).toBe('dQw4w9WgXcQ');
	});

	it('parses youtu.be short URLs', () => {
		const result = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ');
		expect(result).toEqual({ videoId: 'dQw4w9WgXcQ' });
	});

	it('parses youtube.com/embed/ URLs', () => {
		const result = parseYouTubeUrl(
			'https://www.youtube.com/embed/dQw4w9WgXcQ',
		);
		expect(result).toEqual({ videoId: 'dQw4w9WgXcQ' });
	});

	it('parses youtube.com/shorts/ URLs', () => {
		const result = parseYouTubeUrl(
			'https://www.youtube.com/shorts/dQw4w9WgXcQ',
		);
		expect(result).toEqual({ videoId: 'dQw4w9WgXcQ' });
	});

	it('extracts start time from ?t= param', () => {
		const result = parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQ?t=42');
		expect(result).toEqual({ videoId: 'dQw4w9WgXcQ', startTime: '42' });
	});

	it('extracts start time from &t= param', () => {
		const result = parseYouTubeUrl(
			'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120',
		);
		expect(result).toEqual({
			videoId: 'dQw4w9WgXcQ',
			startTime: '120',
		});
	});

	it('returns null for non-YouTube URLs', () => {
		expect(parseYouTubeUrl('https://example.com/video.mp4')).toBeNull();
		expect(parseYouTubeUrl('https://vimeo.com/123456')).toBeNull();
		expect(parseYouTubeUrl('https://picsum.photos/800/600')).toBeNull();
	});

	it('returns null for malformed YouTube URLs', () => {
		expect(parseYouTubeUrl('https://youtube.com/watch')).toBeNull();
		expect(parseYouTubeUrl('https://youtube.com/watch?v=short')).toBeNull();
	});

	it('handles video IDs with hyphens and underscores', () => {
		const result = parseYouTubeUrl('https://youtu.be/abc-def_123');
		expect(result?.videoId).toBe('abc-def_123');
	});
});

// ── youTubeThumbnail ─────────────────────────────────────────────────

describe('youTubeThumbnail', () => {
	it('returns hq thumbnail by default', () => {
		expect(youTubeThumbnail('dQw4w9WgXcQ')).toBe(
			'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
		);
	});

	it('returns maxres thumbnail', () => {
		expect(youTubeThumbnail('dQw4w9WgXcQ', 'maxres')).toBe(
			'https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
		);
	});

	it('returns default quality thumbnail', () => {
		expect(youTubeThumbnail('dQw4w9WgXcQ', 'default')).toBe(
			'https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg',
		);
	});

	it('returns sd thumbnail', () => {
		expect(youTubeThumbnail('dQw4w9WgXcQ', 'sd')).toBe(
			'https://img.youtube.com/vi/dQw4w9WgXcQ/sddefault.jpg',
		);
	});

	it('returns mq thumbnail', () => {
		expect(youTubeThumbnail('dQw4w9WgXcQ', 'mq')).toBe(
			'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
		);
	});
});

// ── youTubeEmbedUrl ──────────────────────────────────────────────────

describe('youTubeEmbedUrl', () => {
	it('builds privacy-enhanced embed URL', () => {
		expect(youTubeEmbedUrl({ videoId: 'dQw4w9WgXcQ' })).toBe(
			'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1',
		);
	});

	it('includes start time when provided', () => {
		expect(
			youTubeEmbedUrl({ videoId: 'dQw4w9WgXcQ', startTime: '42' }),
		).toBe(
			'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&start=42',
		);
	});

	it('omits start param when undefined', () => {
		const url = youTubeEmbedUrl({ videoId: 'abc-def_123' });
		expect(url).not.toContain('&start=');
	});
});

// ── resolveMediaKind ─────────────────────────────────────────────────

describe('resolveMediaKind', () => {
	it('detects YouTube URLs regardless of format field', () => {
		expect(resolveMediaKind('https://youtu.be/dQw4w9WgXcQ', 1)).toBe(
			'youtube',
		);
		expect(
			resolveMediaKind('https://youtube.com/watch?v=dQw4w9WgXcQ', 3),
		).toBe('youtube');
	});

	it('maps format 1 to image', () => {
		expect(resolveMediaKind('https://cdn.example.com/m.jpg', 1)).toBe(
			'image',
		);
	});

	it('maps format 2 to gif', () => {
		expect(resolveMediaKind('https://cdn.example.com/m.gif', 2)).toBe(
			'gif',
		);
	});

	it('maps format 3 to video', () => {
		expect(resolveMediaKind('https://cdn.example.com/m.mp4', 3)).toBe(
			'video',
		);
	});

	it('maps format 4 (webp_anim) to image', () => {
		expect(resolveMediaKind('https://cdn.example.com/m.webp', 4)).toBe(
			'image',
		);
	});

	it('maps format 0 to unknown', () => {
		expect(resolveMediaKind('https://cdn.example.com/m', 0)).toBe(
			'unknown',
		);
	});

	it('maps unknown format to unknown', () => {
		expect(resolveMediaKind('https://cdn.example.com/m', 99)).toBe(
			'unknown',
		);
	});
});

// ── gridThumbnail ────────────────────────────────────────────────────

describe('gridThumbnail', () => {
	it('returns YouTube thumbnail for YouTube URLs', () => {
		const thumb = gridThumbnail('https://youtu.be/dQw4w9WgXcQ', null);
		expect(thumb).toBe(
			'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
		);
	});

	it('prefers thumbnail_url over asset_url for non-YouTube', () => {
		expect(
			gridThumbnail(
				'https://cdn.example.com/m.jpg',
				'https://cdn.example.com/t.jpg',
			),
		).toBe('https://cdn.example.com/t.jpg');
	});

	it('falls back to asset_url when thumbnail_url is null', () => {
		expect(gridThumbnail('https://cdn.example.com/m.jpg', null)).toBe(
			'https://cdn.example.com/m.jpg',
		);
	});

	it('ignores thumbnail_url for YouTube (uses YT thumbnail API)', () => {
		const thumb = gridThumbnail(
			'https://youtu.be/dQw4w9WgXcQ',
			'https://cdn.example.com/custom-thumb.jpg',
		);
		expect(thumb).toContain('img.youtube.com');
	});
});

// ── showPlayOverlay ──────────────────────────────────────────────────

describe('showPlayOverlay', () => {
	it('returns true for video', () => {
		expect(showPlayOverlay('video')).toBe(true);
	});

	it('returns true for youtube', () => {
		expect(showPlayOverlay('youtube')).toBe(true);
	});

	it('returns false for image', () => {
		expect(showPlayOverlay('image')).toBe(false);
	});

	it('returns false for gif', () => {
		expect(showPlayOverlay('gif')).toBe(false);
	});

	it('returns false for unknown', () => {
		expect(showPlayOverlay('unknown')).toBe(false);
	});
});
