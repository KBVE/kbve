/**
 * Media type detection and embed utilities.
 *
 * Determines how to render a meme's asset_url based on URL patterns
 * and the format field. All grid cards show static thumbnails — video
 * and embeds only play in the lightbox.
 */

export type MediaKind = 'image' | 'gif' | 'video' | 'youtube' | 'unknown';

interface YouTubeMatch {
	videoId: string;
	startTime?: string;
}

const YT_PATTERNS = [
	// youtube.com/watch?v=ID
	/(?:youtube\.com\/watch\?.*v=)([\w-]{11})/,
	// youtu.be/ID
	/(?:youtu\.be\/)([\w-]{11})/,
	// youtube.com/embed/ID
	/(?:youtube\.com\/embed\/)([\w-]{11})/,
	// youtube.com/shorts/ID
	/(?:youtube\.com\/shorts\/)([\w-]{11})/,
];

/** Extract YouTube video ID from a URL, or null if not YouTube. */
export function parseYouTubeUrl(url: string): YouTubeMatch | null {
	for (const pattern of YT_PATTERNS) {
		const match = url.match(pattern);
		if (match?.[1]) {
			const timeMatch = url.match(/[?&]t=(\d+)/);
			return {
				videoId: match[1],
				startTime: timeMatch?.[1],
			};
		}
	}
	return null;
}

/** Get a YouTube thumbnail URL for a video ID. */
export function youTubeThumbnail(
	videoId: string,
	quality: 'default' | 'mq' | 'hq' | 'sd' | 'maxres' = 'hq',
): string {
	const qualityMap = {
		default: 'default',
		mq: 'mqdefault',
		hq: 'hqdefault',
		sd: 'sddefault',
		maxres: 'maxresdefault',
	};
	return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}.jpg`;
}

/** Build a YouTube embed URL (privacy-enhanced mode). */
export function youTubeEmbedUrl(match: YouTubeMatch): string {
	let url = `https://www.youtube-nocookie.com/embed/${match.videoId}?rel=0&modestbranding=1`;
	if (match.startTime) url += `&start=${match.startTime}`;
	return url;
}

/**
 * Determine the media kind for a meme.
 * Checks asset_url for YouTube patterns first, then falls back to format field.
 */
export function resolveMediaKind(assetUrl: string, format: number): MediaKind {
	if (parseYouTubeUrl(assetUrl)) return 'youtube';

	switch (format) {
		case 1:
			return 'image';
		case 2:
			return 'gif';
		case 3:
			return 'video';
		case 4:
			return 'image'; // webp_anim renders as <img>
		default:
			return 'unknown';
	}
}

/**
 * Get the best thumbnail URL for a meme in the grid.
 * YouTube memes use the YouTube thumbnail API.
 * Everything else uses thumbnail_url or falls back to asset_url.
 */
export function gridThumbnail(
	assetUrl: string,
	thumbnailUrl: string | null,
): string {
	const yt = parseYouTubeUrl(assetUrl);
	if (yt) return youTubeThumbnail(yt.videoId, 'hq');
	return thumbnailUrl || assetUrl;
}

/** Whether this media kind should show a play button overlay in the grid. */
export function showPlayOverlay(kind: MediaKind): boolean {
	return kind === 'video' || kind === 'youtube';
}
