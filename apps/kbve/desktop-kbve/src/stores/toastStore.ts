import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
	id: string;
	type: ToastType;
	title: string;
	message?: string;
	duration?: number; // milliseconds, 0 = persistent
	createdAt: number;
}

interface ToastStore {
	toasts: Toast[];
	addToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => string;
	removeToast: (id: string) => void;
	clearAll: () => void;
}

// Configuration
const MAX_VISIBLE_TOASTS = 3;
const DEFAULT_DURATION = 6000; // 6 seconds default
const DURATION_BY_TYPE: Record<ToastType, number> = {
	success: 5000,
	info: 6000,
	warning: 7000,
	error: 8000, // errors stay longer
};

let toastCounter = 0;

export const useToastStore = create<ToastStore>((set) => ({
	toasts: [],

	addToast: (toast) => {
		const id = `toast-${Date.now()}-${toastCounter++}`;
		const duration =
			toast.duration ?? DURATION_BY_TYPE[toast.type] ?? DEFAULT_DURATION;

		const newToast: Toast = {
			...toast,
			id,
			createdAt: Date.now(),
			duration,
		};

		set((state) => {
			let updatedToasts = [...state.toasts, newToast];

			// If we exceed max visible, remove the oldest ones
			if (updatedToasts.length > MAX_VISIBLE_TOASTS) {
				// Sort by createdAt and keep only the newest MAX_VISIBLE_TOASTS
				updatedToasts = updatedToasts
					.sort((a, b) => b.createdAt - a.createdAt)
					.slice(0, MAX_VISIBLE_TOASTS);
			}

			return { toasts: updatedToasts };
		});

		// Auto-remove after duration (if not persistent)
		if (duration > 0) {
			setTimeout(() => {
				set((state) => ({
					toasts: state.toasts.filter((t) => t.id !== id),
				}));
			}, duration);
		}

		return id;
	},

	removeToast: (id) =>
		set((state) => ({
			toasts: state.toasts.filter((t) => t.id !== id),
		})),

	clearAll: () => set({ toasts: [] }),
}));

// Global toast helper - can be called from anywhere without hooks
export const toast = {
	/**
	 * Show a success toast (auto-dismisses in 5s)
	 */
	success: (title: string, message?: string, duration?: number): string =>
		useToastStore
			.getState()
			.addToast({ type: 'success', title, message, duration }),

	/**
	 * Show an error toast (auto-dismisses in 8s)
	 */
	error: (title: string, message?: string, duration?: number): string =>
		useToastStore
			.getState()
			.addToast({ type: 'error', title, message, duration }),

	/**
	 * Show a warning toast (auto-dismisses in 7s)
	 */
	warning: (title: string, message?: string, duration?: number): string =>
		useToastStore
			.getState()
			.addToast({ type: 'warning', title, message, duration }),

	/**
	 * Show an info toast (auto-dismisses in 6s)
	 */
	info: (title: string, message?: string, duration?: number): string =>
		useToastStore
			.getState()
			.addToast({ type: 'info', title, message, duration }),

	/**
	 * Remove a specific toast by ID
	 */
	dismiss: (id: string): void => useToastStore.getState().removeToast(id),

	/**
	 * Clear all toasts
	 */
	clear: (): void => useToastStore.getState().clearAll(),
};

// Make toast available globally for easy access
if (typeof window !== 'undefined') {
	(window as unknown as { toast: typeof toast }).toast = toast;
}
