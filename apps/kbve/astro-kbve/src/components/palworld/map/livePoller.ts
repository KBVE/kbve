import { DroidEvents } from '@kbve/droid';
import type { DroidEventMap } from '@kbve/droid';

export type LiveSnapshot = DroidEventMap['palworld-live-snapshot'];

const POLL_MS = 5000;
const STALE_MS = POLL_MS * 3;
const CHANNEL = 'kbve-palworld-live';
const LOCK = 'kbve-palworld-live-poller';

let startedUrl: string | null = null;

export function startLivePoller(url: string): void {
	if (startedUrl) return;
	startedUrl = url;

	const channel =
		typeof BroadcastChannel !== 'undefined'
			? new BroadcastChannel(CHANNEL)
			: null;
	let lastSnapAt = 0;
	let interval: ReturnType<typeof setInterval> | null = null;
	let release: (() => void) | null = null;
	const emit = (snap: LiveSnapshot) => {
		lastSnapAt = Date.now();
		DroidEvents.emit('palworld-live-snapshot', snap);
	};
	channel?.addEventListener(
		'message',
		(ev: MessageEvent<LiveSnapshot | null>) => {
			if (ev.data) {
				emit(ev.data);
				return;
			}
			if (!interval && document.visibilityState === 'visible') contend();
		},
	);

	const poll = async () => {
		let snap: LiveSnapshot;
		try {
			const res = await fetch(url, { cache: 'no-store' });
			if (!res.ok) throw new Error(String(res.status));
			const d = (await res.json()) as Partial<LiveSnapshot>;
			snap = {
				ts: d.ts ?? Date.now(),
				offline: false,
				players: d.players ?? [],
				bosses: d.bosses ?? [],
				events: d.events ?? [],
			};
		} catch {
			snap = {
				ts: Date.now(),
				offline: true,
				players: [],
				bosses: [],
				events: [],
			};
		}
		emit(snap);
		channel?.postMessage(snap);
	};

	const lead = () =>
		new Promise<void>((resolve) => {
			poll();
			interval = setInterval(poll, POLL_MS);
			release = () => {
				if (interval) clearInterval(interval);
				interval = null;
				release = null;
				channel?.postMessage(null);
				resolve();
			};
		});

	const hasLocks =
		typeof navigator !== 'undefined' && !!navigator.locks?.request;

	function contend() {
		if (!hasLocks || interval) return;
		navigator.locks.request(LOCK, { ifAvailable: true }, (lock) =>
			lock ? lead() : undefined,
		);
	}

	if (hasLocks) {
		contend();
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') release?.();
			else contend();
		});
		window.addEventListener('pagehide', () => release?.());
		window.addEventListener('pageshow', () => {
			if (document.visibilityState === 'visible') contend();
		});
		setInterval(() => {
			if (
				!interval &&
				document.visibilityState === 'visible' &&
				Date.now() - lastSnapAt > STALE_MS
			) {
				contend();
				poll();
			}
		}, POLL_MS);
	} else {
		void lead();
	}
}
