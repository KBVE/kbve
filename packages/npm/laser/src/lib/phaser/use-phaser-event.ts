import { useEffect, useRef } from 'react';
import { usePhaserGame } from './use-phaser';

export function usePhaserEvent(
	eventName: string,
	handler: (...args: unknown[]) => void,
	sceneName?: string,
): void {
	const { game } = usePhaserGame();
	const handlerRef = useRef(handler);
	handlerRef.current = handler;

	useEffect(() => {
		if (!game) return;

		const callback = (...args: unknown[]) => handlerRef.current(...args);

		if (sceneName) {
			const scene = game.scene.getScene(sceneName);
			if (scene) {
				scene.events.on(eventName, callback);
				return () => {
					scene.events.off(eventName, callback);
				};
			}
		} else {
			game.events.on(eventName, callback);
			return () => {
				game.events.off(eventName, callback);
			};
		}

		return undefined;
	}, [game, eventName, sceneName]);
}
