import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ─── Tauri Invoke Helpers ────────────────────────────────────────────────────
// Typed wrappers around Tauri invoke() for the view actor commands.

export type ViewStatus = 'idle' | 'running' | 'paused' | 'stopped';

export interface ViewSnapshot {
	view_id: string;
	status: ViewStatus;
	data: Record<string, unknown>;
}

export async function viewStart(id: string): Promise<void> {
	return invoke('view_start', { id });
}

export async function viewStop(id: string): Promise<void> {
	return invoke('view_stop', { id });
}

export async function viewStatus(id: string): Promise<ViewStatus> {
	return invoke('view_status', { id });
}

export async function viewSnapshot(id: string): Promise<ViewSnapshot> {
	return invoke('view_snapshot', { id });
}

export async function viewUpdateConfig(
	id: string,
	config: Record<string, unknown>,
): Promise<void> {
	return invoke('view_update_config', { id, config });
}

export async function viewList(): Promise<[string, ViewStatus][]> {
	return invoke('view_list');
}

// ─── Event Bus ───────────────────────────────────────────────────────────────
// Subscribe to events emitted from Rust view actors.
// Event naming convention: "view:{view_id}:{event_name}"

export interface ViewEvent<T = unknown> {
	viewId: string;
	event: string;
	payload: T;
}

/**
 * Listen to all events from a specific view.
 * Pattern: "view:{viewId}:*" — receives any event the view emits.
 */
export function onViewEvent<T = unknown>(
	viewId: string,
	eventName: string,
	handler: (payload: T) => void,
): Promise<UnlistenFn> {
	return listen<T>(`view:${viewId}:${eventName}`, (event) => {
		handler(event.payload);
	});
}

/**
 * Listen to status changes for a specific view.
 */
export function onViewStatusChange(
	viewId: string,
	handler: (status: ViewStatus) => void,
): Promise<UnlistenFn> {
	return onViewEvent<ViewStatus>(viewId, 'status', handler);
}

/**
 * Listen to config acknowledgements from a view.
 */
export function onViewConfigAck(
	viewId: string,
	handler: (config: Record<string, unknown>) => void,
): Promise<UnlistenFn> {
	return onViewEvent<Record<string, unknown>>(viewId, 'config', handler);
}
