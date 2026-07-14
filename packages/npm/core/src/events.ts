export interface Signal<T> {
	get(): T;
	peek(): T;
	set(next: T | ((prev: T) => T)): void;
	subscribe(listener: () => void): () => void;
}

export function createSignal<T>(initial: T): Signal<T> {
	let value = initial;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		peek: () => value,
		set: (next) => {
			const resolved =
				typeof next === 'function'
					? (next as (prev: T) => T)(value)
					: next;
			if (Object.is(resolved, value)) return;
			value = resolved;
			listeners.forEach((listener) => listener());
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export type EventMap = Record<string, unknown>;
export type EventListener<T> = (payload: T) => void;

export interface EventBus<Events extends EventMap> {
	on<K extends keyof Events>(
		type: K,
		listener: EventListener<Events[K]>,
	): () => void;
	once<K extends keyof Events>(
		type: K,
		listener: EventListener<Events[K]>,
	): () => void;
	off<K extends keyof Events>(
		type: K,
		listener: EventListener<Events[K]>,
	): void;
	emit<K extends keyof Events>(type: K, payload: Events[K]): void;
	clear(): void;
}

export function createEventBus<Events extends EventMap>(): EventBus<Events> {
	const map = new Map<keyof Events, Set<EventListener<unknown>>>();

	const listenersFor = (type: keyof Events): Set<EventListener<unknown>> => {
		let set = map.get(type);
		if (!set) {
			set = new Set();
			map.set(type, set);
		}
		return set;
	};

	const off: EventBus<Events>['off'] = (type, listener) => {
		map.get(type)?.delete(listener as EventListener<unknown>);
	};

	const on: EventBus<Events>['on'] = (type, listener) => {
		listenersFor(type).add(listener as EventListener<unknown>);
		return () => off(type, listener);
	};

	return {
		on,
		off,
		once: (type, listener) => {
			const wrapped: EventListener<Events[typeof type]> = (payload) => {
				off(type, wrapped);
				listener(payload);
			};
			return on(type, wrapped);
		},
		emit: (type, payload) => {
			const set = map.get(type);
			if (!set) return;
			for (const listener of [...set]) {
				(listener as EventListener<Events[typeof type]>)(payload);
			}
		},
		clear: () => map.clear(),
	};
}
