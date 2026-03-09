import {
	createContext,
	useReducer,
	useEffect,
	type ReactNode,
	type Dispatch,
} from 'react';
import { gameEvents } from '../events/event-bus';
import type { Toast } from './toast-types';
import { DEFAULT_TOAST_CONFIG, SEVERITY_DURATIONS } from './toast-types';

// --- Actions ---
export type ToastAction =
	| { type: 'ADD'; toast: Toast }
	| { type: 'MARK_EXITING'; id: string }
	| { type: 'REMOVE'; id: string }
	| { type: 'CLEAR' };

// --- State ---
export interface ToastState {
	toasts: Toast[];
}

function toastReducer(state: ToastState, action: ToastAction): ToastState {
	switch (action.type) {
		case 'ADD': {
			let toasts = [...state.toasts, action.toast];
			if (toasts.length > DEFAULT_TOAST_CONFIG.maxVisible) {
				toasts = toasts.map((t, i) =>
					i === 0 && !t.exiting ? { ...t, exiting: true } : t,
				);
			}
			return { toasts };
		}
		case 'MARK_EXITING':
			return {
				toasts: state.toasts.map((t) =>
					t.id === action.id ? { ...t, exiting: true } : t,
				),
			};
		case 'REMOVE':
			return {
				toasts: state.toasts.filter((t) => t.id !== action.id),
			};
		case 'CLEAR':
			return {
				toasts: state.toasts.map((t) => ({ ...t, exiting: true })),
			};
	}
}

// --- Contexts (split for performance) ---
export const ToastStateContext = createContext<ToastState>({ toasts: [] });
export const ToastDispatchContext = createContext<Dispatch<ToastAction>>(() => {
	/* noop default */
});

// --- Provider ---
export function ToastProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(toastReducer, { toasts: [] });

	// Bridge: event bus → toast state
	useEffect(() => {
		const unsubShow = gameEvents.on(
			'toast:show',
			({ message, severity, duration }) => {
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
		);
		const unsubDismiss = gameEvents.on('toast:dismiss', ({ id }) => {
			dispatch({ type: 'MARK_EXITING', id });
		});
		const unsubClear = gameEvents.on('toast:clear', () => {
			dispatch({ type: 'CLEAR' });
		});
		return () => {
			unsubShow();
			unsubDismiss();
			unsubClear();
		};
	}, []);

	return (
		<ToastStateContext value={state}>
			<ToastDispatchContext value={dispatch}>
				{children}
			</ToastDispatchContext>
		</ToastStateContext>
	);
}
