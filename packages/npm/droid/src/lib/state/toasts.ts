import { map } from 'nanostores';
import { DroidEvents } from '../workers/events';
import type { ToastPayload } from '../types/ui-event-types';

export const $toasts = map<Record<string, ToastPayload>>({});

export function addToast(payload: ToastPayload): void {
	$toasts.set({ ...$toasts.get(), [payload.id]: payload });
	DroidEvents.emit('toast-added', payload);
}

export function removeToast(id: string): void {
	const current = { ...$toasts.get() };
	delete current[id];
	$toasts.set(current);
	DroidEvents.emit('toast-removed', { id });
}
