import { createUiStore, useStore } from './store';

export type ToastTone = 'neutral' | 'success' | 'danger' | 'warning';

export interface ToastModel {
	id: string;
	message: string;
	tone?: ToastTone;
}

interface ToastState {
	queue: readonly ToastModel[];
}

const store = createUiStore<ToastState>({ queue: [] });
let seq = 0;

export const toastStore = {
	subscribe: store.subscribe,
	push: (message: string, tone?: ToastTone): string => {
		const id = `toast-${seq++}`;
		store.set((state) => ({
			queue: [...state.queue, { id, message, tone }],
		}));
		return id;
	},
	dismiss: (id: string) =>
		store.set((state) => ({
			queue: state.queue.filter((t) => t.id !== id),
		})),
};

export function useToasts(): readonly ToastModel[] {
	return useStore(store, (state) => state.queue);
}
