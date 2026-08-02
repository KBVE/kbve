import { DroidEvents } from '@kbve/droid';
import type { DroidEventMap } from '@kbve/droid';

export type LiveSnapshot = DroidEventMap['palworld-live-snapshot'];

const POLL_MS = 5000;
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
	const emit = (snap: LiveSnapshot) =>
		DroidEvents.emit('palworld-live-snapshot', snap);
	channel?.addEventListener('message', (ev: MessageEvent<LiveSnapshot>) =>
		emit(ev.data),
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

	const lead = () => {
		poll();
		setInterval(poll, POLL_MS);
	};

	if (typeof navigator !== 'undefined' && navigator.locks?.request) {
		navigator.locks.request(LOCK, () => {
			lead();
			return new Promise<void>(() => {});
		});
	} else {
		lead();
	}
}
