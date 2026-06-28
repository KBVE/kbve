import type { LaserEventMap } from './types';

type Handler<T> = (data: T) => void;
type ErrorHandler = (err: unknown, event: string, data: unknown) => void;

export interface LaserEventRecord {
	event: string;
	data: unknown;
	time: number;
}

export class LaserEventBus<
	TMap extends Record<string, unknown> = LaserEventMap,
> {
	private handlers = new Map<keyof TMap, Set<Handler<never>>>();
	private errorHandlers = new Set<ErrorHandler>();
	private history: LaserEventRecord[] = [];
	private trace = false;
	private historySize = 0;

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

	once<K extends keyof TMap>(
		event: K,
		handler: Handler<TMap[K]>,
	): () => void {
		const off = this.on(event, ((data: TMap[K]) => {
			off();
			handler(data);
		}) as Handler<TMap[K]>);
		return off;
	}

	off<K extends keyof TMap>(event: K, handler: Handler<TMap[K]>): void {
		this.handlers.get(event)?.delete(handler as Handler<never>);
	}

	emit<K extends keyof TMap>(event: K, data: TMap[K]): void {
		if (this.trace || this.historySize > 0) this.record(event, data);
		const set = this.handlers.get(event);
		if (!set) return;
		for (const handler of [...set]) {
			try {
				(handler as Handler<TMap[K]>)(data);
			} catch (err) {
				this.reportError(err, String(event), data);
			}
		}
	}

	onError(handler: ErrorHandler): () => void {
		this.errorHandlers.add(handler);
		return () => {
			this.errorHandlers.delete(handler);
		};
	}

	setDebug(opts: { trace?: boolean; historySize?: number }): void {
		if (opts.trace !== undefined) this.trace = opts.trace;
		if (opts.historySize !== undefined) {
			this.historySize = Math.max(0, opts.historySize);
			if (this.history.length > this.historySize)
				this.history.splice(0, this.history.length - this.historySize);
		}
	}

	getHistory(): readonly LaserEventRecord[] {
		return this.history;
	}

	dumpHistory(): void {
		console.table(
			this.history.map((r) => ({
				event: r.event,
				time: new Date(r.time).toISOString().slice(11, 23),
				data: r.data,
			})),
		);
	}

	listenerCount<K extends keyof TMap>(event: K): number {
		return this.handlers.get(event)?.size ?? 0;
	}

	eventNames(): (keyof TMap)[] {
		return [...this.handlers.keys()];
	}

	clear(): void {
		this.handlers.clear();
		this.history.length = 0;
	}

	private record<K extends keyof TMap>(event: K, data: TMap[K]): void {
		if (this.trace) console.debug(`[laser] ${String(event)}`, data);
		if (this.historySize > 0) {
			this.history.push({ event: String(event), data, time: Date.now() });
			if (this.history.length > this.historySize) this.history.shift();
		}
	}

	private reportError(err: unknown, event: string, data: unknown): void {
		if (this.errorHandlers.size > 0) {
			for (const h of this.errorHandlers) {
				try {
					h(err, event, data);
				} catch {
					/* swallow */
				}
			}
		} else {
			console.error(`[laser] handler for "${event}" threw:`, err);
		}
	}
}

export const laserEvents = new LaserEventBus<LaserEventMap>();

if (typeof globalThis !== 'undefined') {
	(globalThis as { laserEvents?: unknown }).laserEvents = laserEvents;
}
