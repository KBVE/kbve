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

// Browser-side STUN only; the host advertises host candidates and learns the
// browser's public address via peer-reflexive discovery. No TURN by design.
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

const ICE_POLL_MS = 500;

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
	init?: { method?: string; body?: unknown },
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

interface CreateSessionResponse {
	id?: string;
	session_id?: string;
	ice_servers?: RTCIceServer[];
	[key: string]: unknown;
}

interface SdpResponse {
	sdp?: string;
	type?: string;
	[key: string]: unknown;
}

interface IceResponse {
	candidates?: RTCIceCandidateInit[];
	[key: string]: unknown;
}

// Lifecycle below assumes browser-sends-offer; the exact body shapes and
// offer/answer direction get finalized from the host-side signaling recon.
export class VibeshineSession {
	private pc: RTCPeerConnection | null = null;
	private sessionId: string | null = null;
	private icePollTimer: ReturnType<typeof setInterval> | null = null;
	private seenCandidates = 0;

	async start(video: HTMLVideoElement): Promise<void> {
		$lastError.set(null);
		$playerState.set('checking');

		const status = await fetchHostStatus();
		if (!status?.reachable) {
			$playerState.set('host-offline');
			return;
		}

		$playerState.set('signaling');
		try {
			const created = await api<CreateSessionResponse>('/sessions', {
				method: 'POST',
				body: {},
			});
			this.sessionId = created.id ?? created.session_id ?? null;
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
				void api(`/sessions/${this.sessionId}/ice`, {
					method: 'POST',
					body: ev.candidate.toJSON(),
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

			const answer = await api<SdpResponse>(
				`/sessions/${this.sessionId}/offer`,
				{ method: 'POST', body: { type: offer.type, sdp: offer.sdp } },
			);
			if (!answer.sdp) {
				throw new Error('no answer SDP from host');
			}
			await pc.setRemoteDescription({
				type: (answer.type as RTCSdpType) ?? 'answer',
				sdp: answer.sdp,
			});

			$playerState.set('connecting');
			this.startIcePolling();
		} catch (e) {
			this.fail(e instanceof Error ? e.message : String(e));
		}
	}

	private startIcePolling(): void {
		this.icePollTimer = setInterval(() => {
			void (async () => {
				if (!this.sessionId || !this.pc) return;
				if (this.pc.connectionState === 'connected') {
					this.stopIcePolling();
					return;
				}
				try {
					const remote = await api<IceResponse>(
						`/sessions/${this.sessionId}/ice`,
					);
					const candidates = remote.candidates ?? [];
					for (const c of candidates.slice(this.seenCandidates)) {
						await this.pc.addIceCandidate(c);
					}
					this.seenCandidates = Math.max(
						this.seenCandidates,
						candidates.length,
					);
				} catch (e) {
					console.warn('[vibeshine] ice poll failed:', e);
				}
			})();
		}, ICE_POLL_MS);
	}

	private stopIcePolling(): void {
		if (this.icePollTimer !== null) {
			clearInterval(this.icePollTimer);
			this.icePollTimer = null;
		}
	}

	private fail(message: string): void {
		$lastError.set(message);
		$playerState.set('error');
		void this.stop(false);
	}

	async stop(resetState = true): Promise<void> {
		this.stopIcePolling();
		this.pc?.close();
		this.pc = null;
		if (this.sessionId) {
			const id = this.sessionId;
			this.sessionId = null;
			await api(`/sessions/${id}`, { method: 'DELETE' }).catch(
				() => undefined,
			);
		}
		this.seenCandidates = 0;
		if (resetState) {
			$playerState.set('idle');
		}
	}
}

const PROXY_BASE = '/dashboard/vibeshine/proxy';

export interface VibeshineApp {
	name?: string;
	uuid?: string;
	index?: number;
	[key: string]: unknown;
}

export interface SessionStatus {
	[key: string]: unknown;
}

export const $apps = atom<VibeshineApp[] | null>(null);
export const $appsStatus = atom<'idle' | 'loading' | 'ok' | 'error'>('idle');
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

export async function fetchApps(): Promise<void> {
	$appsStatus.set('loading');
	try {
		const data = await hostApi<{ apps?: VibeshineApp[] } | VibeshineApp[]>(
			'/api/apps',
		);
		const apps = Array.isArray(data) ? data : (data.apps ?? []);
		$apps.set(apps);
		$appsStatus.set('ok');
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

export async function launchApp(app: VibeshineApp): Promise<void> {
	$controlError.set(null);
	try {
		await hostApi('/api/playnite/launch', {
			method: 'POST',
			body: { id: app.uuid ?? app.index ?? app.name },
		});
		await fetchSessionStatus();
	} catch (e) {
		$controlError.set(e instanceof Error ? e.message : String(e));
	}
}
