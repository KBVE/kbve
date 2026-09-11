import { useContext, useCallback } from 'react';
import { ToastDispatchContext } from './toast-context';
import type { ToastSeverity } from './toast-types';
import { SEVERITY_DURATIONS } from './toast-types';

export function useToast() {
	const dispatch = useContext(ToastDispatchContext);

	const show = useCallback(
		(
			message: string,
			severity: ToastSeverity = 'info',
			duration?: number,
		) => {
			dispatch({
				type: 'ADD',
				toast: {
					id: crypto.randomUUID(),
					message,
					severity,
					duration: duration ?? SEVERITY_DURATIONS[severity],
					createdAt: Date.now(),
					exiting: false,
				},
			});
		},
		[dispatch],
	);

	const dismiss = useCallback(
		(id: string) => {
			dispatch({ type: 'MARK_EXITING', id });
		},
		[dispatch],
	);

	const clear = useCallback(() => {
		dispatch({ type: 'CLEAR' });
	}, [dispatch]);

	return { show, dismiss, clear };
}
