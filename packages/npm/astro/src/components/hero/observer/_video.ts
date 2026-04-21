export const parseYouTubeId = (url: string): string | null => {
	if (!url) return null;
	try {
		const u = new URL(url);
		const host = u.hostname.replace(/^www\./, '');
		if (host === 'youtu.be') {
			return u.pathname.slice(1) || null;
		}
		if (host === 'youtube.com' || host === 'm.youtube.com') {
			if (u.pathname === '/watch') return u.searchParams.get('v');
			const parts = u.pathname.split('/').filter(Boolean);
			if (['embed', 'shorts', 'live', 'v'].includes(parts[0])) {
				return parts[1] ?? null;
			}
		}
	} catch {
		return null;
	}
	return null;
};

export const buildYouTubeBgEmbed = (videoId: string): string => {
	const params = new URLSearchParams({
		autoplay: '1',
		mute: '1',
		loop: '1',
		playlist: videoId,
		controls: '0',
		showinfo: '0',
		rel: '0',
		modestbranding: '1',
		playsinline: '1',
		disablekb: '1',
		fs: '0',
		iv_load_policy: '3',
		cc_load_policy: '0',
		enablejsapi: '1',
	});
	return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
};

export const ytPostMessage = (
	iframe: HTMLIFrameElement,
	func: string,
	args: unknown[] = [],
): void => {
	try {
		iframe.contentWindow?.postMessage(
			JSON.stringify({ event: 'command', func, args }),
			'*',
		);
	} catch {}
};

export const ytPlay = (iframe: HTMLIFrameElement): void =>
	ytPostMessage(iframe, 'playVideo');

export const ytPause = (iframe: HTMLIFrameElement): void =>
	ytPostMessage(iframe, 'pauseVideo');

export const ytMute = (iframe: HTMLIFrameElement): void =>
	ytPostMessage(iframe, 'mute');

export const ytSeekTo = (iframe: HTMLIFrameElement, seconds: number): void =>
	ytPostMessage(iframe, 'seekTo', [seconds, true]);
