import type { EventBus, EventMap } from '@kbve/core';
import { toasts as defaultQueue, ToastQueue } from './queue';
import type { ToastInput } from './types';

export type ToastMapper<Events extends EventMap, K extends keyof Events> = (
	payload: Events[K],
) => ToastInput | null | undefined;

export type ToastBridgeMap<Events extends EventMap> = {
	[K in keyof Events]?: ToastMapper<Events, K>;
};

export function bridgeEventsToToasts<Events extends EventMap>(
	bus: EventBus<Events>,
	map: ToastBridgeMap<Events>,
	queue: ToastQueue = defaultQueue,
): () => void {
	const offs: Array<() => void> = [];
	for (const type of Object.keys(map) as (keyof Events)[]) {
		const mapper = map[type];
		if (!mapper) continue;
		offs.push(
			bus.on(type, (payload) => {
				const input = mapper(payload);
				if (input) queue.push(input);
			}),
		);
	}
	return () => {
		for (const off of offs) off();
	};
}
