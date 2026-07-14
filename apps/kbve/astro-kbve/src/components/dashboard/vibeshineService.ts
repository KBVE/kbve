import { atom } from 'nanostores';
import { initSupa, getSupa } from '@/lib/supa';

export type PlayerState =
	| 'idle'
	| 'auth-required'
	| 'checking'
	| 'host-offline'
	| 'signaling'
	| 'connecting'
	| 'streaming'
	| 'error';

export interface HostStatus {
	reachable: boolean;
	upstream_status?: number;
	latency_ms?: number;
	error?: string;
}

export const $playerState = atom<PlayerState>('idle');
export const $hostStatus = atom<HostStatus | null>(null);
export const $lastError = atom<string | null>(null);

const STATUS_URL = '/api/v1/vibeshine/status';
const WEBRTC_BASE = '/api/v1/vibeshine/webrtc';

// Browser-side STUN only; the host returns empty ice_servers (no STUN/TURN
// support) and relies on host candidates + peer-reflexive discovery.
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

const ANSWER_POLL_MS = 1000;
const ANSWER_POLL_LIMIT = 30;

async function getAuthHeaders(): Promise<Record<string, string> | null> {
	const supa = getSupa() ?? initSupa();
	if (!supa) return null;
	const { session } = await supa.getSession();
	if (!session?.access_token) return null;
	return {
		Authorization: `Bearer ${session.access_token}`,
		'Content-Type': 'application/json',
	};
}

async function api<T>(
	path: string,
	init?: { method?: string; body?: unknown; keepalive?: boolean },
): Promise<T> {
	const headers = await getAuthHeaders();
	if (!headers) {
		$playerState.set('auth-required');
		throw new Error('not authenticated');
	}
	const resp = await fetch(`${WEBRTC_BASE}${path}`, {
		method: init?.method ?? 'GET',
		headers,
		body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
		keepalive: init?.keepalive,
	});
	if (!resp.ok) {
		throw new Error(
			`${init?.method ?? 'GET'} ${path} → HTTP ${resp.status}`,
		);
	}
	const text = await resp.text();
	return (text ? JSON.parse(text) : {}) as T;
}

export async function fetchHostStatus(): Promise<HostStatus | null> {
	const headers = await getAuthHeaders();
	if (!headers) {
		$playerState.set('auth-required');
		return null;
	}
	const resp = await fetch(STATUS_URL, { headers });
	if (!resp.ok) {
		$hostStatus.set({ reachable: false, error: `HTTP ${resp.status}` });
		return null;
	}
	const status = (await resp.json()) as HostStatus;
	$hostStatus.set(status);
	return status;
}

export interface StreamConfig {
	width: number;
	height: number;
	fps: number;
	bitrateKbps: number;
	codec: 'h264' | 'hevc' | 'av1';
}

export const DEFAULT_STREAM_CONFIG: StreamConfig = {
	width: 1920,
	height: 1080,
	fps: 60,
	bitrateKbps: 20000,
	codec: 'h264',
};

interface SessionInfo {
	id?: string;
	[key: string]: unknown;
}

interface CreateSessionResponse {
	status?: boolean;
	ice_servers?: RTCIceServer[];
	cert_fingerprint?: string;
	session?: SessionInfo;
	[key: string]: unknown;
}

interface SessionListResponse {
	sessions?: SessionInfo[];
	[key: string]: unknown;
}

interface SdpResponse {
	sdp?: string;
	type?: string;
	[key: string]: unknown;
}

interface IceCandidatePayload {
	candidate?: string;
	sdpMid?: string | null;
	sdpMLineIndex?: number | null;
}

export class VibeshineSession {
	private pc: RTCPeerConnection | null = null;
	private sessionId: string | null = null;
	private iceAbort: AbortController | null = null;

	async start(
		video: HTMLVideoElement,
		appId: number,
		config: StreamConfig = DEFAULT_STREAM_CONFIG,
	): Promise<void> {
		$lastError.set(null);
		$playerState.set('checking');

		const status = await fetchHostStatus();
		if (!status?.reachable) {
			$playerState.set('host-offline');
			return;
		}

		$playerState.set('signaling');
		try {
			// The host allows one active session; clear any stale ones first.
			const existing = await api<SessionListResponse>('/sessions').catch(
				() => null,
			);
			for (const s of existing?.sessions ?? []) {
				if (s.id) {
					await api(`/sessions/${s.id}`, { method: 'DELETE' }).catch(
						() => undefined,
					);
				}
			}

			// Strict serde body: omit optional fields entirely, never null.
			const created = await api<CreateSessionResponse>('/sessions', {
				method: 'POST',
				body: {
					audio: true,
					host_audio: true,
					video: true,
					encoded: true,
					width: config.width,
					height: config.height,
					fps: config.fps,
					bitrate_kbps: config.bitrateKbps,
					codec: config.codec,
					hdr: false,
					app_id: appId,
					resume: false,
					video_pacing_mode: 'balanced',
					video_pacing_slack_ms: 2,
					video_max_frame_age_ms: 100,
				},
			});
			this.sessionId = created.session?.id ?? null;
			if (!this.sessionId) {
				throw new Error('session create returned no id');
			}

			const iceServers = created.ice_servers?.length
				? [...created.ice_servers, ...ICE_SERVERS]
				: ICE_SERVERS;

			const pc = new RTCPeerConnection({ iceServers });
			this.pc = pc;

			pc.addTransceiver('video', { direction: 'recvonly' });
			pc.addTransceiver('audio', { direction: 'recvonly' });

			pc.ontrack = (ev) => {
				if (video.srcObject !== ev.streams[0]) {
					video.srcObject = ev.streams[0];
					void video.play().catch(() => undefined);
				}
			};

			pc.onicecandidate = (ev) => {
				if (!ev.candidate || !this.sessionId) return;
				const c = ev.candidate;
				void api(`/sessions/${this.sessionId}/ice`, {
					method: 'POST',
					body: {
						candidates: [
							{
								candidate: c.candidate,
								sdpMid: c.sdpMid,
								sdpMLineIndex: c.sdpMLineIndex,
							},
						],
					},
				}).catch((e) =>
					console.warn('[vibeshine] ice send failed:', e),
				);
			};

			pc.onconnectionstatechange = () => {
				switch (pc.connectionState) {
					case 'connected':
						$playerState.set('streaming');
						break;
					case 'failed':
						this.fail(
							'peer connection failed (NAT may be symmetric)',
						);
						break;
					case 'disconnected':
					case 'closed':
						if ($playerState.get() === 'streaming') {
							void this.stop();
						}
						break;
				}
			};

			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);

			let answer = await api<SdpResponse>(
				`/sessions/${this.sessionId}/offer`,
				{ method: 'POST', body: { type: 'offer', sdp: offer.sdp } },
			);
			for (let i = 0; !answer.sdp && i < ANSWER_POLL_LIMIT; i++) {
				await new Promise((r) => setTimeout(r, ANSWER_POLL_MS));
				answer = await api<SdpResponse>(
					`/sessions/${this.sessionId}/answer`,
				);
			}
			if (!answer.sdp) {
				throw new Error('no answer SDP from host');
			}
			await pc.setRemoteDescription({
				type: (answer.type as RTCSdpType) ?? 'answer',
				sdp: answer.sdp,
			});

			$playerState.set('connecting');
			this.consumeIceStream();
		} catch (e) {
			this.fail(e instanceof Error ? e.message : String(e));
		}
	}

	// SSE over fetch (EventSource can't send the Authorization header).
	// `lastEventId` is a resumable cursor fed back as ?since= on reconnect.
	private consumeIceStream(): void {
		const abort = new AbortController();
		this.iceAbort = abort;
		let cursor: string | null = null;

		const run = async (): Promise<void> => {
			while (!abort.signal.aborted && this.sessionId && this.pc) {
				try {
					const headers = await getAuthHeaders();
					if (!headers) return;
					const qs = cursor
						? `?since=${encodeURIComponent(cursor)}`
						: '';
					const resp = await fetch(
						`${WEBRTC_BASE}/sessions/${this.sessionId}/ice/stream${qs}`,
						{ headers, signal: abort.signal },
					);
					if (!resp.ok || !resp.body) {
						throw new Error(`ice stream → HTTP ${resp.status}`);
					}
					const reader = resp.body.getReader();
					const decoder = new TextDecoder();
					let buffer = '';
					for (;;) {
						const { done, value } = await reader.read();
						if (done) break;
						buffer += decoder.decode(value, { stream: true });
						let idx: number;
						while ((idx = buffer.indexOf('\n\n')) !== -1) {
							const raw = buffer.slice(0, idx);
							buffer = buffer.slice(idx + 2);
							const next = this.handleSseEvent(raw);
							if (next) cursor = next;
						}
					}
				} catch (e) {
					if (abort.signal.aborted) return;
					console.warn('[vibeshine] ice stream retry:', e);
					await new Promise((r) => setTimeout(r, 1000));
				}
			}
		};
		void run();
	}

	private handleSseEvent(raw: string): string | null {
		let event = 'message';
		let data = '';
		let id: string | null = null;
		for (const line of raw.split('\n')) {
			if (line.startsWith('event:')) event = line.slice(6).trim();
			else if (line.startsWith('data:')) data += line.slice(5).trim();
			else if (line.startsWith('id:')) id = line.slice(3).trim();
		}
		if (event === 'candidate' && data && this.pc) {
			try {
				const c = JSON.parse(data) as IceCandidatePayload;
				void this.pc
					.addIceCandidate({
						candidate: c.candidate ?? '',
						sdpMid: c.sdpMid ?? undefined,
						sdpMLineIndex: c.sdpMLineIndex ?? undefined,
					})
					.catch((e) =>
						console.warn('[vibeshine] addIceCandidate failed:', e),
					);
			} catch (e) {
				console.warn('[vibeshine] bad candidate event:', e);
			}
		}
		return id;
	}

	private fail(message: string): void {
		$lastError.set(message);
		$playerState.set('error');
		void this.stop(false);
	}

	async stop(resetState = true): Promise<void> {
		this.iceAbort?.abort();
		this.iceAbort = null;
		this.pc?.close();
		this.pc = null;
		if (this.sessionId) {
			const id = this.sessionId;
			this.sessionId = null;
			await api(`/sessions/${id}`, {
				method: 'DELETE',
				keepalive: true,
			}).catch(() => undefined);
		}
		if (resetState) {
			$playerState.set('idle');
		}
	}
}

const PROXY_BASE = '/dashboard/vibeshine/proxy';

export interface VibeshineApp {
	name?: string;
	id?: number | string;
	uuid?: string;
	index?: number;
	[key: string]: unknown;
}

export interface SessionStatus {
	[key: string]: unknown;
}

export const $apps = atom<VibeshineApp[] | null>(null);
export const $appsStatus = atom<'idle' | 'loading' | 'ok' | 'error'>('idle');
export const $selectedApp = atom<VibeshineApp | null>(null);
export const $sessionStatus = atom<SessionStatus | null>(null);
export const $controlError = atom<string | null>(null);

async function hostApi<T>(
	path: string,
	init?: { method?: string; body?: unknown },
): Promise<T> {
	const headers = await getAuthHeaders();
	if (!headers) {
		$playerState.set('auth-required');
		throw new Error('not authenticated');
	}
	const resp = await fetch(`${PROXY_BASE}${path}`, {
		method: init?.method ?? 'GET',
		headers,
		body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
	});
	if (!resp.ok) {
		throw new Error(
			`${init?.method ?? 'GET'} ${path} → HTTP ${resp.status}`,
		);
	}
	const text = await resp.text();
	return (text ? JSON.parse(text) : {}) as T;
}

export function appNumericId(app: VibeshineApp): number | null {
	const id = Number(app.id);
	return Number.isFinite(id) ? id : null;
}

export async function fetchApps(): Promise<void> {
	$appsStatus.set('loading');
	try {
		const data = await hostApi<{ apps?: VibeshineApp[] } | VibeshineApp[]>(
			'/api/apps',
		);
		const apps = Array.isArray(data) ? data : (data.apps ?? []);
		$apps.set(apps);
		$appsStatus.set('ok');
		if (!$selectedApp.get() && apps.length) {
			$selectedApp.set(
				apps.find((a) => appNumericId(a) !== null) ?? null,
			);
		}
	} catch (e) {
		$controlError.set(e instanceof Error ? e.message : String(e));
		$appsStatus.set('error');
	}
}

export async function fetchSessionStatus(): Promise<void> {
	try {
		const data = await hostApi<SessionStatus>('/api/session/status');
		$sessionStatus.set(data);
	} catch {
		$sessionStatus.set(null);
	}
}

export async function closeApp(): Promise<void> {
	$controlError.set(null);
	try {
		await hostApi('/api/apps/close', { method: 'POST', body: {} });
		await fetchSessionStatus();
	} catch (e) {
		$controlError.set(e instanceof Error ? e.message : String(e));
	}
}
