import { DroidEventSchemas } from '../types/event-types';
import type {
	DroidEventMap,
	EventKey,
	EventHandler,
} from '../types/event-types';

class DroidEventBus {
	private listeners = new Map<EventKey, Set<(payload: unknown) => void>>();

	on<K extends EventKey>(event: K, handler: EventHandler<K>) {
		let handlers = this.listeners.get(event);
		if (!handlers) {
			handlers = new Set();
			this.listeners.set(event, handlers);
		}
		handlers.add(handler as (payload: unknown) => void);
	}

	off<K extends EventKey>(event: K, handler: EventHandler<K>) {
		this.listeners
			.get(event)
			?.delete(handler as (payload: unknown) => void);
	}

	emit<K extends EventKey>(event: K, payload: DroidEventMap[K]) {
		const schema = DroidEventSchemas[event];
		if (schema) {
			try {
				schema.parse(payload);
			} catch (err) {
				console.error(
					`[DroidEventBus] Invalid payload for ${event}:`,
					err,
				);
				return;
			}
		}

		window.dispatchEvent(new CustomEvent(event, { detail: payload }));

		for (const handler of this.listeners.get(event) ?? []) {
			try {
				(handler as EventHandler<K>)(payload);
			} catch (err) {
				console.error(
					`[DroidEventBus] Listener error for ${event}:`,
					err,
				);
			}
		}
	}

	wait<K extends EventKey>(event: K): Promise<DroidEventMap[K]> {
		return new Promise((resolve) => {
			const fn: EventHandler<K> = (payload) => {
				this.off(event, fn);
				resolve(payload);
			};
			this.on(event, fn);
		});
	}
}

export const DroidEvents = new DroidEventBus();
