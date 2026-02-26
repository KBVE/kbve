import { map } from 'nanostores';
import { DroidEvents } from '../workers/events';
import type { ToastPayload } from '../types/ui-event-types';

export const $toasts = map<Record<string, ToastPayload>>({});

// Returns the pre-mount toast buffer, or null if the ToastContainer
// has already mounted and drained it (future toasts reach the
// container via nanostores + the CustomEvent bridge instead).
function getToastQueue(): ToastPayload[] | null {
	if (window.__kbveToastQueue === null) return null;
	if (!window.__kbveToastQueue) window.__kbveToastQueue = [];
	return window.__kbveToastQueue;
}

export function addToast(payload: ToastPayload): void {
	$toasts.set({ ...$toasts.get(), [payload.id]: payload });
	getToastQueue()?.push(payload);
	DroidEvents.emit('toast-added', payload);
}

export function removeToast(id: string): void {
	const current = { ...$toasts.get() };
	delete current[id];
	$toasts.set(current);

	const q = getToastQueue();
	if (q) {
		const idx = q.findIndex((t) => t.id === id);
		if (idx !== -1) q.splice(idx, 1);
	}

	DroidEvents.emit('toast-removed', { id });
}
