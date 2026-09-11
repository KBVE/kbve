import type { GameEventMap } from './event-map';

type Listener<T> = (payload: T) => void;

class EventBus<TMap extends { [key: string]: unknown }> {
	private listeners = new Map<keyof TMap, Set<Listener<never>>>();

	on<K extends keyof TMap>(
		event: K,
		listener: Listener<TMap[K]>,
	): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const set = this.listeners.get(event)!;
		const fn = listener as Listener<never>;
		set.add(fn);
		return () => {
			set.delete(fn);
		};
	}

	once<K extends keyof TMap>(
		event: K,
		listener: Listener<TMap[K]>,
	): () => void {
		const unsub = this.on(event, ((payload: TMap[K]) => {
			unsub();
			listener(payload);
		}) as Listener<TMap[K]>);
		return unsub;
	}

	emit<K extends keyof TMap>(
		event: K,
		...args: TMap[K] extends void ? [] : [payload: TMap[K]]
	): void {
		const set = this.listeners.get(event);
		if (set) {
			const payload = args[0] as TMap[K];
			set.forEach((fn) => (fn as Listener<TMap[K]>)(payload));
		}
	}

	off<K extends keyof TMap>(event: K): void {
		this.listeners.delete(event);
	}
}

export const gameEvents = new EventBus<GameEventMap>();
