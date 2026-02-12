import type { LaserEventMap } from './types';

type Handler<T> = (data: T) => void;

export class LaserEventBus<
	TMap extends Record<string, unknown> = LaserEventMap,
> {
	private handlers = new Map<keyof TMap, Set<Handler<never>>>();

	on<K extends keyof TMap>(event: K, handler: Handler<TMap[K]>): () => void {
		let set = this.handlers.get(event);
		if (!set) {
			set = new Set();
			this.handlers.set(event, set);
		}
		set.add(handler as Handler<never>);
		return () => {
			set.delete(handler as Handler<never>);
		};
	}

	off<K extends keyof TMap>(event: K, handler: Handler<TMap[K]>): void {
		this.handlers.get(event)?.delete(handler as Handler<never>);
	}

	emit<K extends keyof TMap>(event: K, data: TMap[K]): void {
		this.handlers.get(event)?.forEach((handler) => {
			(handler as Handler<TMap[K]>)(data);
		});
	}

	clear(): void {
		this.handlers.clear();
	}
}

export const laserEvents = new LaserEventBus<LaserEventMap>();
