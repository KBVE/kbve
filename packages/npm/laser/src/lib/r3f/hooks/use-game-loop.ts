import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

export function useGameLoop(
	callback: (delta: number, elapsed: number) => void,
): void {
	const callbackRef = useRef(callback);
	callbackRef.current = callback;

	useFrame((state, delta) => {
		callbackRef.current(delta, state.clock.elapsedTime);
	});
}
