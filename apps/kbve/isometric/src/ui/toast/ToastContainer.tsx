import { useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getPortalRoot } from '../shared/portal';
import { ToastStateContext, ToastDispatchContext } from './toast-context';
import { ToastItem } from './ToastItem';

export function ToastContainer() {
	const { toasts } = useContext(ToastStateContext);
	const dispatch = useContext(ToastDispatchContext);

	const handleDismiss = useCallback(
		(id: string) => {
			const toast = toasts.find((t) => t.id === id);
			if (toast?.exiting) {
				dispatch({ type: 'REMOVE', id });
			} else {
				dispatch({ type: 'MARK_EXITING', id });
			}
		},
		[toasts, dispatch],
	);

	if (toasts.length === 0) return null;

	return createPortal(
		<div className="fixed top-14 right-4 flex flex-col items-end pointer-events-none">
			{toasts.map((toast) => (
				<ToastItem
					key={toast.id}
					toast={toast}
					onDismiss={handleDismiss}
				/>
			))}
		</div>,
		getPortalRoot('toast-root'),
	);
}
