import { atom } from 'nanostores';
import { authedApiFetch, ApiError } from '@/lib/apiFetch';
import { DASH_PROXY_BASE } from '@/components/rnweb/dashProxyBase';

export type ReelState = 'idle' | 'loading' | 'probing' | 'raw' | 'hls' | 'error';

export const $reelState = atom<ReelState>('idle');
export const $reelError = atom<string | null>(null);
export const $reelName = atom<string | null>(null);
export const $reelNotice = atom<string | null>(null);

// The reel the player is currently bound to. Clicking Play in the console sets
// this; the player island reacts and starts playback in place — no navigation,
// no second click.
export const $reelSelectedId = atom<string | null>(null);

export function selectReel(id: string): void {
	$reelSelectedId.set(id);
	if (typeof window !== 'undefined') {
		const url = new URL(window.location.href);
		url.searchParams.set('id', id);
		// Keep the URL shareable/refresh-safe without reloading the page.
		window.history.replaceState(null, '', url);
	}
}

export interface ReelDetail {
	id?: string;
	name?: string;
	state?: string;
	hls?: string;
	transcode?: string;
	[key: string]: unknown;
}

export type ReelTorrentState = 'Leeching' | 'Seeding' | 'Reaped' | 'Failed';
export type ReelTranscodeStatus =
	| 'None'
	| 'Pending'
	| 'Remuxing'
	| 'Encoding'
	| 'Ready'
	| 'Failed';
export type ReelHlsStatus = 'None' | 'Starting' | 'Live' | 'Ready' | 'Failed';

export type ReelPhase =
	| 'resolving-metadata'
	| 'connecting'
	| 'downloading'
	| 'moving'
	| 'ready'
	| 'transcoding'
	| 'streaming-hls'
	| 'failed'
	| 'reaped';

export interface ReelTorrent {
	id: string;
	name: string;
	size: number;
	state: ReelTorrentState;
	phase?: ReelPhase;
	completed_at?: number | null;
	last_access: number;
	error?: string | null;
	transcode: ReelTranscodeStatus;
	transcode_error?: string | null;
	transcode_progress?: ReelTranscodeProgress | null;
	hls: ReelHlsStatus;
	hls_error?: string | null;
}

export interface ReelTranscodeProgress {
	pct: number;
	speed: number;
	eta_secs?: number | null;
}

export interface ReelLive {
	id: string;
	progress_bytes: number;
	total_bytes: number;
	finished: boolean;
	download_mbps: number;
	upload_mbps: number;
	peers_live: number;
	peers_seen: number;
	peers_connecting: number;
}

export interface ReelCounts {
	total: number;
	leeching: number;
	seeding: number;
	failed: number;
}

export interface ReelStatusTorrent extends ReelTorrent {
	phase: ReelPhase;
	live?: ReelLive;
}

export interface ReelStatusReport {
	vpn_ok: boolean;
	trackers: number;
	bt_listen_port?: number;
	forwarded_port?: number;
	inbound_ready: boolean;
	counts: ReelCounts;
	torrents: ReelStatusTorrent[];
}

export interface ReelHealth {
	vpn_ok: boolean;
	trackers: number;
	bt_listen_port?: number;
	forwarded_port?: number;
	inbound_ready: boolean;
	counts: ReelCounts;
}

export const $reelList = atom<ReelTorrent[]>([]);
export const $reelListError = atom<string | null>(null);
export const $reelListLoading = atom<boolean>(false);
export const $reelLive = atom<Record<string, ReelLive>>({});
export const $reelHealth = atom<ReelHealth | null>(null);

const REEL_PATH: string =
	(import.meta.env.PUBLIC_REEL_BASE as string | undefined) ?? '/api/v1/reel';
const MEDIA_BASE = `${DASH_PROXY_BASE}${REEL_PATH}`;
const MANIFEST_MIME = 'application/vnd.apple.mpegurl';

const MAX_POLLS = 25;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 5000;

let mediaTokenCache: { token: string; expiresAtMs: number } | null = null;

async function mediaToken(): Promise<string | null> {
	const dev = import.meta.env.PUBLIC_REEL_TOKEN as string | undefined;
	if (dev) return dev;
	if (mediaTokenCache && mediaTokenCache.expiresAtMs > Date.now()) {
		return mediaTokenCache.token;
	}
	try {
		const res = await authedApiFetch<{ token: string; exp: number }>(
			`${REEL_PATH}/media-token`,
		);
		mediaTokenCache = {
			token: res.token,
			expiresAtMs: Date.now() + Math.max(0, res.exp - 30) * 1000,
		};
		return res.token;
	} catch {
		mediaTokenCache = null;
		return null;
	}
}

export function formatEta(secs: number | null | undefined): string {
	if (secs == null || !Number.isFinite(secs) || secs < 0) return '';
	if (secs < 1) return 'almost done';
	if (secs < 60) return `~${Math.round(secs)}s left`;
	if (secs < 3600) {
		const m = Math.floor(secs / 60);
		const s = Math.round(secs % 60);
		return s > 0 ? `~${m}m ${s}s left` : `~${m}m left`;
	}
	const h = Math.floor(secs / 3600);
	const m = Math.round((secs % 3600) / 60);
	return m > 0 ? `~${h}h ${m}m left` : `~${h}h left`;
}

export function formatSpeed(x: number | null | undefined): string {
	if (x == null || !Number.isFinite(x) || x <= 0) return '';
	return `${x.toFixed(x < 10 ? 1 : 0)}×`;
}

// librqbit reports speed in MiB/s
export function downloadEtaSecs(
	progressBytes: number,
	totalBytes: number,
	mibps: number,
): number | null {
	const remaining = totalBytes - progressBytes;
	const bytesPerSec = mibps * 1024 * 1024;
	if (remaining <= 0 || bytesPerSec <= 0) return null;
	return remaining / bytesPerSec;
}

export function mediaUrl(id: string, suffix: string, token: string | null): string {
	const base = `${MEDIA_BASE}/torrents/${encodeURIComponent(id)}${suffix}`;
	if (!token) return base;
	const sep = suffix.includes('?') ? '&' : '?';
	return `${base}${sep}access_token=${encodeURIComponent(token)}`;
}

// Native <video> HLS (iOS Safari) can't send an Authorization header, and the
// relative child-playlist/segment URLs drop the query-string token — so scope
// the media token into a cookie the browser sends with every media subrequest.
function setMediaCookie(token: string): void {
	if (typeof document === 'undefined') return;
	const maxAge = mediaTokenCache
		? Math.max(0, Math.floor((mediaTokenCache.expiresAtMs - Date.now()) / 1000))
		: 300;
	const secure = location.protocol === 'https:' ? '; Secure' : '';
	document.cookie = `reel_media_token=${token}; Path=${MEDIA_BASE}; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}


export interface ReelSubtitle {
	index: number;
	label: string;
	lang: string;
}

export async function fetchSubtitles(id: string): Promise<ReelSubtitle[]> {
	try {
		return await authedApiFetch<ReelSubtitle[]>(
			`${REEL_PATH}/torrents/${encodeURIComponent(id)}/subtitles`,
		);
	} catch {
		return [];
	}
}

export async function listTorrents(): Promise<ReelTorrent[]> {
	return authedApiFetch<ReelTorrent[]>(`${REEL_PATH}/torrents`);
}

export async function addTorrent(source: string): Promise<string> {
	const res = await authedApiFetch<{ id: string }>(`${REEL_PATH}/torrents`, {
		method: 'POST',
		body: JSON.stringify({ source }),
	});
	return res.id;
}

export async function deleteTorrent(id: string): Promise<void> {
	await authedApiFetch<void>(
		`${REEL_PATH}/torrents/${encodeURIComponent(id)}`,
		{ method: 'DELETE' },
	);
}

export async function startTranscode(id: string): Promise<void> {
	await authedApiFetch<void>(
		`${REEL_PATH}/torrents/${encodeURIComponent(id)}/transcode`,
		{ method: 'POST' },
	);
}

export async function fetchLiveStats(): Promise<ReelLive[]> {
	return authedApiFetch<ReelLive[]>(`${REEL_PATH}/stats`);
}

export async function refreshLiveStats(): Promise<void> {
	try {
		const stats = await fetchLiveStats();
		$reelLive.set(Object.fromEntries(stats.map((s) => [s.id, s])));
	} catch {
		/* stats are best-effort; keep the last snapshot */
	}
}

export async function fetchStatus(): Promise<ReelStatusReport> {
	return authedApiFetch<ReelStatusReport>(`${REEL_PATH}/status`);
}

export async function refreshReelList(): Promise<void> {
	$reelListLoading.set(true);
	try {
		const report = await fetchStatus();
		$reelList.set(report.torrents);
		$reelLive.set(
			Object.fromEntries(
				report.torrents
					.filter((t) => t.live)
					.map((t) => [t.id, t.live as ReelLive]),
			),
		);
		$reelHealth.set({
			vpn_ok: report.vpn_ok,
			trackers: report.trackers,
			bt_listen_port: report.bt_listen_port,
			forwarded_port: report.forwarded_port,
			inbound_ready: report.inbound_ready,
			counts: report.counts,
		});
		$reelListError.set(null);
	} catch (e) {
		// While polling (we already have a snapshot), a transient auth gap
		// (401 during a token refresh) or an upstream blip (502/503 while the
		// reel pod rolls) shouldn't wipe the view or flash an error — keep the
		// last good data and let the next tick recover.
		const status = e instanceof ApiError ? e.status : 0;
		const transient = status === 401 || status === 502 || status === 503;
		if (transient && $reelList.get().length > 0) {
			return;
		}
		$reelListError.set(
			status === 401
				? 'sign in as staff to manage reels'
				: e instanceof Error
					? e.message
					: String(e),
		);
	} finally {
		$reelListLoading.set(false);
	}
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

export function mediaErrorMessage(err: MediaError | null | undefined): string {
	switch (err?.code) {
		case 1:
			return 'playback aborted';
		case 2:
			return 'network error while streaming';
		case 3:
			return "browser can't decode this file — try Transcode to HLS";
		case 4:
			return "this container/codec isn't playable raw — try Transcode to HLS";
		default:
			return 'playback failed';
	}
}

export class ReelPlayer {
	private hls: import('hls.js').default | null = null;
	private generation = 0;
	private pollTimer: ReturnType<typeof setTimeout> | null = null;
	private video: HTMLVideoElement | null = null;
	private stallTimer: ReturnType<typeof setInterval> | null = null;
	private recover: (() => void) | null = null;
	private lastPos = 0;

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
			if (detail?.state === 'Failed') {
				this.fail(
					typeof detail.error === 'string' && detail.error
						? detail.error
						: 'this reel failed to download',
				);
				return;
			}
			if (detail?.state === 'Reaped') {
				this.fail('this reel expired and was removed — re-add it to watch');
				return;
			}
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
		let status: number;
		try {
			const resp = await fetch(mediaUrl(id, '/manifest.m3u8', null), {
				cache: 'no-store',
				headers: { Authorization: `Bearer ${token}` },
			});
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
				await this.playHls(video, id, token, gen);
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
		this.attachVideoError(video, gen);
		video.src = mediaUrl(id, '/stream', token);
		$reelState.set('raw');
		if (leeching) {
			$reelNotice.set('still downloading — playing the available portion');
		}
		void this.addSubtitleTracks(video, id, token, gen);
		this.recover = () => {
			// Re-request the byte-range stream from the current position.
			const at = video.currentTime;
			video.src = mediaUrl(id, '/stream', token);
			const resume = () => {
				try {
					if (at > 0) video.currentTime = at;
				} catch {
					void 0;
				}
				video.removeEventListener('loadedmetadata', resume);
			};
			video.addEventListener('loadedmetadata', resume);
			void video.play().catch(() => undefined);
		};
		this.startWatchdog(video, gen);
		void video.play().catch(() => undefined);
	}

	// A stall watchdog: if the playhead stops advancing while playback is
	// intended and the buffer is starved (readyState below HAVE_FUTURE_DATA),
	// kick the active recovery path. Runs until torn down, so a stream that
	// hangs at the download edge resumes on its own without a manual refresh.
	private startWatchdog(video: HTMLVideoElement, gen: number): void {
		this.stopWatchdog();
		this.lastPos = video.currentTime;
		this.stallTimer = setInterval(() => {
			if (this.generation !== gen) return;
			const v = this.video;
			if (!v || v.paused || v.ended || v.seeking) {
				this.lastPos = v?.currentTime ?? 0;
				return;
			}
			const advanced = v.currentTime - this.lastPos;
			this.lastPos = v.currentTime;
			// HAVE_FUTURE_DATA (3) or more means it can play on; below that while
			// the clock isn't moving is a genuine stall.
			if (advanced < 0.05 && v.readyState < 3) {
				this.recover?.();
			}
		}, 5000);
	}

	private stopWatchdog(): void {
		if (this.stallTimer) {
			clearInterval(this.stallTimer);
			this.stallTimer = null;
		}
	}

	// Attach sidecar subtitles (kept beside a completed download) as WebVTT
	// <track>s. The <track> element can't send headers, so the token rides the
	// query string. Live HLS carries its own subtitle rendition, so leeching
	// entries simply return an empty list here.
	private async addSubtitleTracks(
		video: HTMLVideoElement,
		id: string,
		token: string,
		gen: number,
	): Promise<void> {
		this.removeSubtitleTracks(video);
		const subs = await fetchSubtitles(id);
		if (this.generation !== gen || !subs.length) return;
		subs.forEach((s, i) => {
			const track = document.createElement('track');
			track.kind = 'subtitles';
			track.label = s.label;
			track.srclang = s.lang || 'und';
			track.src = mediaUrl(id, `/subtitles/${s.index}`, token);
			if (i === 0) track.default = true;
			video.appendChild(track);
		});
		// Show the first track once its cues load.
		const first = video.textTracks[0];
		if (first) first.mode = 'showing';
	}

	private removeSubtitleTracks(video: HTMLVideoElement): void {
		video
			.querySelectorAll('track')
			.forEach((t) => t.parentNode?.removeChild(t));
	}

	private attachVideoError(video: HTMLVideoElement, gen: number): void {
		video.onerror = () => {
			if (this.generation !== gen) return;
			this.fail(mediaErrorMessage(video.error));
		};
	}

	private async playHls(
		video: HTMLVideoElement,
		id: string,
		token: string,
		gen: number,
	): Promise<void> {
		if (this.generation !== gen) return;
		// Sidecar subs for a completed entry; live HLS returns an empty list and
		// shows its own in-stream subtitle rendition instead.
		void this.addSubtitleTracks(video, id, token, gen);
		// Prefer hls.js wherever it's supported (desktop Safari included). Its
		// XHRs carry the token in the Authorization header, so every request —
		// master, child playlists, segments, subtitle VTTs — authenticates. The
		// native <video> HLS path can't send headers, and relative child/segment
		// URLs drop the query-string token, so it 401s on multi-variant streams;
		// keep it only as a last resort for engines without MSE (iOS Safari).
		const Hls = (await import('hls.js')).default;
		if (this.generation !== gen) return;
		if (Hls.isSupported()) {
			// Buffer generously: popcorn segments are produced ahead of the
			// playhead as the download runs, so let the player hold minutes of
			// that lead to ride out download dips instead of stalling.
			const hls = new Hls({
				maxBufferLength: 120,
				maxMaxBufferLength: 600,
				backBufferLength: 90,
				liveSyncDurationCount: 6,
				lowLatencyMode: false,
				// Keep trying hard before giving up — a live popcorn stream at the
				// download edge sees transient frag/playlist errors that resolve as
				// more of the file arrives.
				maxBufferHole: 0.5,
				fragLoadingMaxRetry: 8,
				levelLoadingMaxRetry: 8,
				manifestLoadingMaxRetry: 8,
				xhrSetup: (xhr: XMLHttpRequest, url: string) => {
					xhr.open('GET', url, true);
					xhr.setRequestHeader('Authorization', `Bearer ${token}`);
				},
			});
			this.hls = hls;
			// Recovery ladder: don't fail on the first fatal error. Resume loading
			// on network errors, rebuild the buffer on media errors, and only give
			// up once repeated recovery attempts stop working.
			let netRetries = 0;
			let mediaRetries = 0;
			const MAX_RECOVER = 6;
			hls.on(Hls.Events.FRAG_BUFFERED, () => {
				netRetries = 0;
				mediaRetries = 0;
			});
			hls.on(Hls.Events.ERROR, (_evt, data) => {
				if (!data.fatal) return;
				if (this.generation !== gen) return;
				switch (data.type) {
					case Hls.ErrorTypes.NETWORK_ERROR:
						if (netRetries++ < MAX_RECOVER) {
							setTimeout(() => {
								if (this.generation === gen) hls.startLoad();
							}, 1000);
						} else {
							this.fail(`network error: ${data.details}`);
						}
						break;
					case Hls.ErrorTypes.MEDIA_ERROR:
						if (mediaRetries++ < MAX_RECOVER) {
							hls.recoverMediaError();
						} else {
							this.fail(`media error: ${data.details}`);
						}
						break;
					default:
						this.fail(`HLS error: ${data.type}`);
				}
			});
			// Auto-enable the first subtitle rendition (the live stream marks it
			// DEFAULT=YES) so provided subs show without hunting for a menu.
			hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_evt, data) => {
				if (data.subtitleTracks.length > 0) {
					hls.subtitleDisplay = true;
					hls.subtitleTrack = 0;
				}
			});
			hls.loadSource(mediaUrl(id, '/manifest.m3u8', null));
			hls.attachMedia(video);
			$reelState.set('hls');
			this.recover = () => {
				hls.startLoad();
				void video.play().catch(() => undefined);
			};
			this.startWatchdog(video, gen);
			void video.play().catch(() => undefined);
			return;
		}
		if (video.canPlayType(MANIFEST_MIME)) {
			// Last resort (iOS Safari, no MSE): native HLS. The element can't send
			// headers and relative child/segment URLs drop the query token, so
			// scope the token into a cookie the browser sends with every request;
			// the query token on the master covers the very first request.
			setMediaCookie(token);
			this.attachVideoError(video, gen);
			video.src = mediaUrl(id, '/manifest.m3u8', token);
			$reelState.set('hls');
			this.recover = () => {
				// Native HLS has no load API — reload the source at the same spot.
				const at = video.currentTime;
				setMediaCookie(token);
				video.src = mediaUrl(id, '/manifest.m3u8', token);
				const resume = () => {
					try {
						if (at > 0) video.currentTime = at;
					} catch {
						void 0;
					}
					video.removeEventListener('loadedmetadata', resume);
				};
				video.addEventListener('loadedmetadata', resume);
				void video.play().catch(() => undefined);
			};
			this.startWatchdog(video, gen);
			void video.play().catch(() => undefined);
			return;
		}
		this.fail('HLS is not supported in this browser');
	}

	private teardown(): void {
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
		this.stopWatchdog();
		this.recover = null;
		if (this.video) {
			this.video.onerror = null;
			this.removeSubtitleTracks(this.video);
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
