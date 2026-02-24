import { useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $toasts, addToast, removeToast } from '@kbve/droid';
import type { ToastPayload, ToastSeverity } from '@kbve/droid';

export function useToast() {
	const toasts = useStore($toasts);

	const add = useCallback((payload: ToastPayload) => addToast(payload), []);
	const remove = useCallback((id: string) => removeToast(id), []);

	const notify = useCallback(
		(
			message: string,
			severity: ToastSeverity = 'info',
			duration = 5000,
		): string => {
			const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
			addToast({ id, message, severity, duration });
			return id;
		},
		[],
	);

	return { toasts, add, remove, notify };
}
