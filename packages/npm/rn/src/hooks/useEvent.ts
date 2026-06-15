import { useEffect, useRef } from 'react';
import type { EventBus, EventMap } from '@kbve/core';

export function useEvent<Events extends EventMap, K extends keyof Events>(
	bus: EventBus<Events>,
	type: K,
	handler: (payload: Events[K]) => void,
): void {
	const ref = useRef(handler);
	ref.current = handler;
	useEffect(
		() => bus.on(type, (payload) => ref.current(payload)),
		[bus, type],
	);
}
