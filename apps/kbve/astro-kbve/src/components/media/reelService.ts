import { atom } from 'nanostores';
import { authedApiFetch, ApiError } from '@/lib/apiFetch';
import { DASH_PROXY_BASE } from '@/components/rnweb/dashProxyBase';
import {
	DroidEvents,
	addToast,
	type ReelStreamStage,
	type ReelStreamErrorCode,
	type ReelStreamPayload,
} from '@kbve/droid';

export type ReelState =
	| 'idle'
	| 'loading'
	| 'probing'
	| 'raw'
	| 'hls'
	| 'reconnecting'
	| 'error';

export const $reelState = atom<ReelState>('idle');
export const $reelError = atom<string | null>(null);
export const $reelName = atom<string | null>(null);
export const $reelNotice = atom<string | null>(null);
export const $reelStatus = atom<ReelStreamPayload | null>(null);

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
	/** Credits charged for pulling this fetch, once the sweep settles it. */
	billed_credits?: number | null;
	billed_at?: number | null;
	refunded_at?: number | null;
	billing_error?: string | null;
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
	port_rotations: number;
	vpn_fail_streak: number;
	counts: ReelCounts;
	torrents: ReelStatusTorrent[];
}

export interface ReelHealth {
	vpn_ok: boolean;
	trackers: number;
	bt_listen_port?: number;
	forwarded_port?: number;
	inbound_ready: boolean;
	port_rotations: number;
	vpn_fail_streak: number;
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
const MAX_RESURRECTS = 30;
// Reconnects that never reach playback, counted inside one window: a stream
// that flaps this fast is broken at the source, not recovering.
const MAX_THRASH = 4;
const RESURRECT_WINDOW_MS = 60000;

let mediaTokenCache: { token: string; expiresAtMs: number } | null = null;

// Why a token could not be minted. Only a real 401/403 means the viewer isn't
// signed in — every other failure (proxy 502, reel restart, offline) used to be
// reported as "sign in to watch", which sent signed-in users chasing an auth
// problem that didn't exist.
export interface MediaTokenResult {
	token: string | null;
	code: ReelStreamErrorCode;
	message: string;
}

async function mediaToken(force = false): Promise<MediaTokenResult> {
	const ok = (token: string): MediaTokenResult => ({
		token,
		code: 'unknown',
		message: '',
	});
	const dev = import.meta.env.PUBLIC_REEL_TOKEN as string | undefined;
	if (dev) return ok(dev);
	if (!force && mediaTokenCache && mediaTokenCache.expiresAtMs > Date.now()) {
		return ok(mediaTokenCache.token);
	}
	try {
		const res = await authedApiFetch<{ token: string; exp: number }>(
			`${REEL_PATH}/media-token`,
		);
		mediaTokenCache = {
			token: res.token,
			expiresAtMs: Date.now() + Math.max(0, res.exp - 30) * 1000,
		};
		return ok(res.token);
	} catch (e) {
		const status = e instanceof ApiError ? e.status : 0;
		if (status === 401 || status === 403) {
			mediaTokenCache = null;
			return {
				token: null,
				code: 'sign-in',
				message: 'sign in to watch',
			};
		}
		// Transient: keep a still-valid cached token so playback survives a
		// blip instead of tearing down over a failed refresh.
		if (mediaTokenCache && mediaTokenCache.expiresAtMs > Date.now()) {
			return ok(mediaTokenCache.token);
		}
		mediaTokenCache = null;
		return {
			token: null,
			code: 'network',
			message: status
				? `reel access service returned ${status} — retrying`
				: 'cannot reach the reel access service — retrying',
		};
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

export function mediaUrl(
	id: string,
	suffix: string,
	token: string | null,
): string {
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
		? Math.max(
				0,
				Math.floor((mediaTokenCache.expiresAtMs - Date.now()) / 1000),
			)
		: 300;
	const secure = location.protocol === 'https:' ? '; Secure' : '';
	document.cookie = `reel_media_token=${token}; Path=${MEDIA_BASE}; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export interface ReelFile {
	index: number;
	name: string;
	size: number;
	content_type: string;
}

export interface ReelFileListing {
	id: string;
	name: string;
	archive_name: string;
	total_bytes: number;
	/** Unix seconds. Reel reaps a torrent this long after its last access, and
	 * every listing or download pushes the window forward. */
	expires_at: number;
	files: ReelFile[];
}

export class ReelFilesNotReady extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ReelFilesNotReady';
	}
}

export async function fetchReelFiles(id: string): Promise<ReelFileListing> {
	try {
		return await authedApiFetch<ReelFileListing>(
			`${REEL_PATH}/torrents/${encodeURIComponent(id)}/files`,
		);
	} catch (e) {
		// 425 is the server saying "still downloading", not a failure — the
		// panel polls through it instead of showing an error.
		if (e instanceof ApiError && e.status === 425) {
			throw new ReelFilesNotReady(
				'still downloading — files can be saved once it completes',
			);
		}
		throw e;
	}
}

/// A download is a top-level navigation, so it cannot carry an Authorization
/// header — the media token rides in the query string exactly like playback.
async function downloadHref(id: string, suffix: string): Promise<string> {
	const minted = await mediaToken();
	if (!minted.token) throw new Error(minted.message || 'sign in to download');
	setMediaCookie(minted.token);
	return mediaUrl(id, suffix, minted.token);
}

export function fileDownloadHref(id: string, index: number): Promise<string> {
	return downloadHref(id, `/files/${index}`);
}

export function archiveDownloadHref(id: string): Promise<string> {
	return downloadHref(id, '/archive.zip');
}

/** Reel bills one credit per MiB, once, when it has to pull the bytes. */
export function formatCredits(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n) || n < 0) return '';
	return `${n.toLocaleString()} cr`;
}

export function formatBytes(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n) || n < 0) return '';
	if (n < 1024) return `${n} B`;
	const units = ['KB', 'MB', 'GB', 'TB'];
	let v = n / 1024;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatExpiry(
	expiresAtSecs: number | null | undefined,
	nowMs: number = Date.now(),
): string {
	if (!expiresAtSecs || !Number.isFinite(expiresAtSecs)) return '';
	const left = expiresAtSecs * 1000 - nowMs;
	if (left <= 0) return 'expired';
	const mins = Math.round(left / 60000);
	if (mins < 60) return `${mins}m left`;
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return m > 0 ? `${h}h ${m}m left` : `${h}h left`;
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
			port_rotations: report.port_rotations,
			vpn_fail_streak: report.vpn_fail_streak,
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

export type ProbeAction = 'raw' | 'hls' | 'poll' | 'error';

export function nextFromManifestStatus(status: number): ProbeAction {
	switch (status) {
		case 200:
			return 'hls';
		case 202:
			return 'poll';
		case 409:
			return 'raw';
		// 425 Too Early: a still-downloading torrent whose live HLS job hasn't
		// warmed up yet. Poll for it — never fall back to progressive playback of
		// an in-flight file: that stream isn't seekable, so the first stall
		// reloads it from the start and the video loops the opening seconds
		// forever. Live HLS is the only correct path while leeching.
		case 425:
			return 'poll';
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
	private tokenTimer: ReturnType<typeof setInterval> | null = null;
	private recover: (() => void) | null = null;
	private lastPos = 0;
	private resurrects = 0;
	private thrash = 0;
	private lastResurrectAt = 0;
	private currentId: string | null = null;

	private emit(
		stage: ReelStreamStage,
		message: string,
		extra?: {
			code?: ReelStreamErrorCode;
			attempt?: number;
			max?: number;
			fatal?: boolean;
		},
	): void {
		const payload: ReelStreamPayload = {
			timestamp: Date.now(),
			id: this.currentId ?? '',
			stage,
			message,
			...extra,
		};
		$reelStatus.set(payload);
		try {
			DroidEvents.emit('reel-stream', payload);
		} catch {
			void 0;
		}
	}

	async start(video: HTMLVideoElement, id: string): Promise<void> {
		const gen = ++this.generation;
		this.teardown();
		this.resurrects = 0;
		this.thrash = 0;
		this.lastResurrectAt = 0;
		this.currentId = id;
		this.video = video;
		$reelError.set(null);
		$reelNotice.set(null);
		$reelName.set(null);
		$reelState.set('loading');
		this.emit('loading', 'Loading…');

		const minted = await mediaToken();
		if (this.generation !== gen) return;
		if (!minted.token) {
			this.fail(minted.message, minted.code);
			return;
		}
		const token = minted.token;

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
					'download-failed',
				);
				return;
			}
			if (detail?.state === 'Reaped') {
				this.fail(
					'this reel expired and was removed — re-add it to watch',
					'reaped',
				);
				return;
			}
		} catch (e) {
			if (this.generation !== gen) return;
			if (e instanceof ApiError && e.status === 404) {
				this.fail('torrent not found', 'not-found');
				return;
			}
			if (e instanceof ApiError && e.status === 401) {
				this.fail('sign in to watch', 'sign-in');
				return;
			}
			this.fail(e instanceof Error ? e.message : String(e), 'network');
			return;
		}

		$reelState.set('probing');
		this.emit('probing', 'Preparing stream…');
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
			this.fail('network error reaching reel', 'network');
			return;
		}
		if (this.generation !== gen) return;

		switch (nextFromManifestStatus(status)) {
			case 'raw':
				this.playRaw(video, id, token, gen);
				return;
			case 'hls':
				await this.playHls(video, id, token, gen);
				return;
			case 'poll':
				if (attempt >= MAX_POLLS) {
					this.fail(
						'still preparing — retry in a moment',
						'transcode-timeout',
					);
					return;
				}
				this.emit('probing', 'Preparing stream…', {
					attempt: attempt + 1,
					max: MAX_POLLS,
				});
				this.pollTimer = setTimeout(() => {
					void this.probe(video, id, token, attempt + 1, gen);
				}, backoffMs(attempt));
				return;
			case 'error':
				this.fail(
					status === 503
						? 'HLS delivery disabled'
						: `unexpected status ${status}`,
					status === 503 ? 'unsupported' : 'unknown',
				);
				return;
		}
	}

	private playRaw(
		video: HTMLVideoElement,
		id: string,
		token: string,
		gen: number,
	): void {
		if (this.generation !== gen) return;
		this.attachVideoError(video, gen);
		video.src = mediaUrl(id, '/stream', token);
		$reelState.set('raw');
		this.emit('playing', 'Streaming');
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
	// kick the active recovery path. A frozen EVENT playlist (dead encoder)
	// never errors — playlist reloads keep returning 200 — so repeated
	// no-progress kicks escalate to a full resurrect instead of kicking forever.
	private startWatchdog(video: HTMLVideoElement, gen: number): void {
		this.stopWatchdog();
		this.lastPos = video.currentTime;
		let stalledKicks = 0;
		const MAX_STALL_KICKS = 6;
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
				if (++stalledKicks >= MAX_STALL_KICKS && this.currentId) {
					void this.resurrect(
						v,
						this.currentId,
						gen,
						'network',
						'no playback progress — restarting stream',
					);
					return;
				}
				this.recover?.();
			} else {
				stalledKicks = 0;
			}
		}, 5000);
	}

	// A failed encoder now finalizes its playlist with EXT-X-ENDLIST, so the
	// player "ends" mid-movie instead of hanging. Tell a real end apart from a
	// dead encoder by asking the server: HLS Failed means restart the stream.
	private watchEndedEarly(
		video: HTMLVideoElement,
		id: string,
		gen: number,
	): void {
		video.addEventListener(
			'ended',
			() => {
				if (this.generation !== gen) return;
				void authedApiFetch<ReelDetail>(
					`${REEL_PATH}/torrents/${encodeURIComponent(id)}`,
				)
					.then((detail) => {
						if (this.generation !== gen) return;
						if (detail?.hls === 'Failed') {
							void this.resurrect(
								video,
								id,
								gen,
								'network',
								'encoder failed mid-stream — restarting',
							);
						}
					})
					.catch(() => undefined);
			},
			{ once: true },
		);
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
			let liveToken = token;
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
					xhr.setRequestHeader(
						'Authorization',
						`Bearer ${liveToken}`,
					);
				},
			});
			this.hls = hls;
			if (this.tokenTimer) clearInterval(this.tokenTimer);
			this.tokenTimer = setInterval(() => {
				if (this.generation !== gen) return;
				void mediaToken().then((r) => {
					if (r.token && this.generation === gen) liveToken = r.token;
				});
			}, 60000);
			// Recovery ladder: don't fail on the first fatal error. Resume loading
			// on network errors, rebuild the buffer on media errors, and only give
			// up once repeated recovery attempts stop working.
			let netRetries = 0;
			let mediaRetries = 0;
			let starveRetries = 0;
			const MAX_RECOVER = 6;
			// Live-edge starvation: the encoder simply hasn't produced the next
			// segment yet, so frag/playlist loads fail while nothing is actually
			// broken. That's buffering, not an error — wait and reload with a far
			// larger budget than the real-error ladder.
			const MAX_STARVE = 40;
			const STARVATION_DETAILS = new Set<string>([
				Hls.ErrorDetails.FRAG_LOAD_ERROR,
				Hls.ErrorDetails.FRAG_LOAD_TIMEOUT,
				Hls.ErrorDetails.LEVEL_LOAD_ERROR,
				Hls.ErrorDetails.LEVEL_LOAD_TIMEOUT,
			]);
			hls.on(Hls.Events.FRAG_BUFFERED, () => {
				netRetries = 0;
				mediaRetries = 0;
				starveRetries = 0;
				this.resurrects = 0;
				this.thrash = 0;
			});
			hls.on(Hls.Events.ERROR, (_evt, data) => {
				if (!data.fatal) return;
				if (this.generation !== gen) return;
				switch (data.type) {
					case Hls.ErrorTypes.NETWORK_ERROR: {
						const expired = data.response?.code === 401;
						if (
							!expired &&
							STARVATION_DETAILS.has(data.details) &&
							starveRetries++ < MAX_STARVE
						) {
							this.emit(
								'playing',
								'Buffering — waiting for stream data',
							);
							setTimeout(() => {
								if (this.generation === gen) hls.startLoad();
							}, 3000);
							break;
						}
						const code: ReelStreamErrorCode = expired
							? 'token-expired'
							: 'network';
						if (netRetries++ < MAX_RECOVER) {
							void mediaToken(true).then((r) => {
								if (this.generation !== gen) return;
								if (r.token) liveToken = r.token;
								setTimeout(() => {
									if (this.generation === gen)
										hls.startLoad();
								}, 1000);
							});
						} else {
							void this.resurrect(
								video,
								id,
								gen,
								code,
								`network error: ${data.details}`,
							);
						}
						break;
					}
					case Hls.ErrorTypes.MEDIA_ERROR:
						if (mediaRetries++ < MAX_RECOVER) {
							hls.recoverMediaError();
						} else {
							void this.resurrect(
								video,
								id,
								gen,
								'media',
								`media error: ${data.details}`,
							);
						}
						break;
					default:
						void this.resurrect(
							video,
							id,
							gen,
							'manifest-flip',
							`stream changed: ${data.details}`,
						);
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
			this.emit('playing', 'Streaming');
			this.recover = () => {
				hls.startLoad();
				void video.play().catch(() => undefined);
			};
			this.startWatchdog(video, gen);
			this.watchEndedEarly(video, id, gen);
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
			this.emit('playing', 'Streaming');
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
			this.watchEndedEarly(video, id, gen);
			void video.play().catch(() => undefined);
			return;
		}
		this.fail('HLS is not supported in this browser', 'unsupported');
	}

	private teardown(): void {
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
			this.pollTimer = null;
		}
		this.stopWatchdog();
		if (this.tokenTimer) {
			clearInterval(this.tokenTimer);
			this.tokenTimer = null;
		}
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

	private fail(message: string, code: ReelStreamErrorCode = 'unknown'): void {
		$reelError.set(message);
		$reelState.set('error');
		this.emit('error', message, { code, fatal: true });
		try {
			addToast({
				id: `reel-${this.currentId ?? 'stream'}-${code}`,
				message,
				severity: 'error',
				duration: 6000,
			});
		} catch {
			void 0;
		}
		this.teardown();
	}

	// A reconnect that never buffers a fragment is a loop, not a recovery: each
	// cycle tears the media element down and rebuilds it, which the viewer sees
	// as flicker. Reconnect attempts that produce no playback back off, and a
	// burst of them inside one short window stops with the server's own reason
	// rather than flapping until the attempt budget runs out.
	private async resurrect(
		video: HTMLVideoElement,
		id: string,
		gen: number,
		code: ReelStreamErrorCode,
		reason: string,
	): Promise<void> {
		if (this.generation !== gen) return;
		const now = Date.now();
		if (now - this.lastResurrectAt > RESURRECT_WINDOW_MS) this.thrash = 0;
		this.lastResurrectAt = now;
		if (++this.thrash > MAX_THRASH) {
			const why = await this.streamFailureReason(id);
			this.fail(
				why ?? 'stream keeps dropping — the source may be unplayable',
				code,
			);
			return;
		}
		if (this.resurrects++ >= MAX_RESURRECTS) {
			const why = await this.streamFailureReason(id);
			this.fail(why ?? 'stream ended — could not recover', code);
			return;
		}
		const attempt = this.resurrects;
		$reelState.set('reconnecting');
		this.emit('reconnecting', reason, {
			code,
			attempt,
			max: MAX_RESURRECTS,
		});
		this.stopWatchdog();
		if (this.tokenTimer) {
			clearInterval(this.tokenTimer);
			this.tokenTimer = null;
		}
		this.recover = null;
		if (this.hls) {
			try {
				this.hls.destroy();
			} catch {
				void 0;
			}
			this.hls = null;
		}
		if (this.video) this.video.onerror = null;
		const minted = await mediaToken(true);
		if (this.generation !== gen) return;
		if (!minted.token) {
			this.fail(minted.message, minted.code);
			return;
		}
		// Back off with each consecutive attempt that hasn't reached playback.
		await new Promise((r) =>
			setTimeout(r, backoffMs(Math.min(this.thrash, 4) - 1)),
		);
		if (this.generation !== gen) return;
		await this.probe(video, id, minted.token, 0, gen);
	}

	// Ask the server why playback keeps failing so the viewer sees the actual
	// cause (encoder died, torrent failed, entry reaped) instead of a generic
	// "could not recover".
	private async streamFailureReason(id: string): Promise<string | null> {
		try {
			const d = await authedApiFetch<ReelDetail>(
				`${REEL_PATH}/torrents/${encodeURIComponent(id)}`,
			);
			if (!d) return null;
			if (d.state === 'Failed') {
				return typeof d.error === 'string' && d.error
					? `download failed: ${d.error}`
					: 'this reel failed to download';
			}
			if (d.state === 'Reaped') {
				return 'this reel expired and was removed — re-add it to watch';
			}
			if (d.hls === 'Failed') {
				const why = d.hls_error;
				return typeof why === 'string' && why
					? `the stream encoder failed: ${why}`
					: 'the stream encoder failed — try Transcode from the console';
			}
			return null;
		} catch {
			return null;
		}
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
			this.currentId = null;
			$reelState.set('idle');
			$reelError.set(null);
			$reelNotice.set(null);
			$reelStatus.set(null);
		}
	}
}
