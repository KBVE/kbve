import { useEffect, useCallback } from 'react';
import { gameEvents } from './event-bus';
import type { GameEventMap } from './event-map';

export function useEvent<K extends keyof GameEventMap>(
	event: K,
	handler: (payload: GameEventMap[K]) => void,
): void {
	useEffect(() => {
		return gameEvents.on(event, handler);
	}, [event, handler]);
}

export function useEmit() {
	return useCallback(
		<K extends keyof GameEventMap>(
			event: K,
			...args: GameEventMap[K] extends void
				? []
				: [payload: GameEventMap[K]]
		) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(gameEvents.emit as any)(event, ...args);
		},
		[],
	);
}
