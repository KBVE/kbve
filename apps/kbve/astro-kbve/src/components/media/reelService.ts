import { atom } from 'nanostores';
import { getAccessToken } from '@kbve/astro';
import { authedApiFetch, ApiError } from '@/lib/apiFetch';
import { DASH_PROXY_BASE } from '@/components/rnweb/dashProxyBase';

export type ReelState = 'idle' | 'loading' | 'probing' | 'raw' | 'hls' | 'error';

export const $reelState = atom<ReelState>('idle');
export const $reelError = atom<string | null>(null);
export const $reelName = atom<string | null>(null);
export const $reelNotice = atom<string | null>(null);

export interface ReelDetail {
	id?: string;
	name?: string;
	state?: string;
	hls?: string;
	transcode?: string;
	[key: string]: unknown;
}

const REEL_PATH: string =
	(import.meta.env.PUBLIC_REEL_BASE as string | undefined) ?? '/api/reel';
const MEDIA_BASE = `${DASH_PROXY_BASE}${REEL_PATH}`;
const MANIFEST_MIME = 'application/vnd.apple.mpegurl';

const MAX_POLLS = 25;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 5000;

async function mediaToken(): Promise<string | null> {
	const dev = import.meta.env.PUBLIC_REEL_TOKEN as string | undefined;
	if (dev) return dev;
	return getAccessToken();
}

export function mediaUrl(id: string, suffix: string, token: string | null): string {
	const base = `${MEDIA_BASE}/torrents/${encodeURIComponent(id)}${suffix}`;
	if (!token) return base;
	const sep = suffix.includes('?') ? '&' : '?';
	return `${base}${sep}token=${encodeURIComponent(token)}`;
}

export function withToken(url: string, token: string): string {
	if (url.includes('token=')) return url;
	const sep = url.includes('?') ? '&' : '?';
	return `${url}${sep}token=${encodeURIComponent(token)}`;
}

export type ProbeAction = 'raw' | 'raw-leeching' | 'hls' | 'poll' | 'error';

export function nextFromManifestStatus(status: number): ProbeAction {
	switch (status) {
		case 200:
			return 'hls';
		case 202:
			return 'poll';
		case 409:
			return 'raw';
		case 425:
			return 'raw-leeching';
		default:
			return 'error';
	}
}

export function backoffMs(attempt: number): number {
	return Math.min(BACKOFF_BASE_MS * Math.pow(1.5, attempt), BACKOFF_CAP_MS);
}

export class ReelPlayer {
	private hls: { destroy: () => void } | null = null;
	private generation = 0;
	private pollTimer: ReturnType<typeof setTimeout> | null = null;
	private video: HTMLVideoElement | null = null;

	async start(video: HTMLVideoElement, id: string): Promise<void> {
		const gen = ++this.generation;
		this.teardown();
		this.video = video;
		$reelError.set(null);
		$reelNotice.set(null);
		$reelName.set(null);
		$reelState.set('loading');

		const token = await mediaToken();
		if (this.generation !== gen) return;
		if (!token) {
			this.fail('sign in to watch');
			return;
		}

		try {
			const detail = await authedApiFetch<ReelDetail>(
				`${REEL_PATH}/torrents/${encodeURIComponent(id)}`,
			);
			if (this.generation !== gen) return;
			$reelName.set(detail?.name ?? null);
		} catch (e) {
			if (this.generation !== gen) return;
			if (e instanceof ApiError && e.status === 404) {
				this.fail('torrent not found');
				return;
			}
			if (e instanceof ApiError && e.status === 401) {
				this.fail('sign in to watch');
				return;
			}
			this.fail(e instanceof Error ? e.message : String(e));
			return;
		}

		$reelState.set('probing');
		await this.probe(video, id, token, 0, gen);
	}

	private async probe(
		video: HTMLVideoElement,
		id: string,
		token: string,
		attempt: number,
		gen: number,
	): Promise<void> {
		if (this.generation !== gen) return;
		const manifestUrl = mediaUrl(id, '/manifest.m3u8', token);
		let status: number;
		try {
			const resp = await fetch(manifestUrl, { cache: 'no-store' });
			status = resp.status;
		} catch {
			if (this.generation !== gen) return;
			this.fail('network error reaching reel');
			return;
		}
		if (this.generation !== gen) return;

		switch (nextFromManifestStatus(status)) {
			case 'raw':
				this.playRaw(video, id, token, false, gen);
				return;
			case 'raw-leeching':
				this.playRaw(video, id, token, true, gen);
				return;
			case 'hls':
				await this.playHls(video, manifestUrl, token, gen);
				return;
			case 'poll':
				if (attempt >= MAX_POLLS) {
					this.fail('still preparing — retry in a moment');
					return;
				}
				this.pollTimer = setTimeout(() => {
					void this.probe(video, id, token, attempt + 1, gen);
				}, backoffMs(attempt));
				return;
			case 'error':
				this.fail(
					status === 503
						? 'HLS delivery disabled'
						: `unexpected status ${status}`,
				);
				return;
		}
	}

	private playRaw(
		video: HTMLVideoElement,
		id: string,
		token: string,
		leeching: boolean,
		gen: number,
	): void {
		if (this.generation !== gen) return;
		video.src = mediaUrl(id, '/stream', token);
		$reelState.set('raw');
		if (leeching) {
			$reelNotice.set('still downloading — playing the available portion');
		}
		void video.play().catch(() => undefined);
	}

	private async playHls(
		video: HTMLVideoElement,
		manifestUrl: string,
		token: string,
		gen: number,
	): Promise<void> {
		if (this.generation !== gen) return;
		if (video.canPlayType(MANIFEST_MIME)) {
			video.src = manifestUrl;
			$reelState.set('hls');
			void video.play().catch(() => undefined);
			return;
		}
		const Hls = (await import('hls.js')).default;
		if (this.generation !== gen) return;
		if (!Hls.isSupported()) {
			this.fail('HLS is not supported in this browser');
			return;
		}
		const hls = new Hls({
			xhrSetup: (xhr: XMLHttpRequest, url: string) => {
				xhr.open('GET', withToken(url, token), true);
			},
		});
		this.hls = hls;
		hls.on(Hls.Events.ERROR, (_evt, data) => {
			if (data.fatal) this.fail(`HLS error: ${data.type}`);
		});
		hls.loadSource(manifestUrl);
		hls.attachMedia(video);
		$reelState.set('hls');
		void video.play().catch(() => undefined);
	}

	private teardown(): void {
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
		if (this.hls) {
			try {
				this.hls.destroy();
			} catch {
				void 0;
			}
			this.hls = null;
		}
	}

	private fail(message: string): void {
		$reelError.set(message);
		$reelState.set('error');
		this.teardown();
	}

	stop(reset = true): void {
		this.generation++;
		this.teardown();
		if (this.video) {
			try {
				this.video.pause();
				this.video.removeAttribute('src');
				this.video.load();
			} catch {
				void 0;
			}
		}
		if (reset) {
			this.video = null;
			$reelState.set('idle');
			$reelError.set(null);
			$reelNotice.set(null);
		}
	}
}
