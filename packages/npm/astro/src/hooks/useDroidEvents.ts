import { useEffect } from 'react';
import { DroidEvents } from '@kbve/droid';
import type { EventKey, EventHandler } from '@kbve/droid';

export function useDroidEvents<K extends EventKey>(
	event: K,
	handler: EventHandler<K>,
): void {
	useEffect(() => {
		DroidEvents.on(event, handler);
		return () => {
			DroidEvents.off(event, handler);
		};
	}, [event, handler]);
}
