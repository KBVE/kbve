import { useCallback, useMemo } from 'react';
import { useInputRouter } from './InputProvider';
import type { ActionId } from '../actions';
import { TouchStick } from '../devices/touch';

export function useInputAction(action: ActionId) {
	const router = useInputRouter();
	const press = useCallback(
		(strength = 1) => router.press(action, strength),
		[router, action],
	);
	const release = useCallback(() => router.release(action), [router, action]);
	const setAnalog = useCallback(
		(value: number) => router.setAnalog(action, value),
		[router, action],
	);
	return { press, release, setAnalog };
}

// Pointer handlers for an on-screen button bound to one action.
export function useActionButton(action: ActionId) {
	const { press, release } = useInputAction(action);
	return useMemo(
		() => ({
			onPointerDown: () => press(),
			onPointerUp: () => release(),
			onPointerLeave: () => release(),
		}),
		[press, release],
	);
}

export function useTouchStick(): TouchStick {
	const router = useInputRouter();
	return useMemo(() => new TouchStick(router), [router]);
}
