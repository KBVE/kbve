import type { EventMap } from '@kbve/core';

export type ToastTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';

export const ToastPriority = {
	low: 0,
	normal: 10,
	high: 20,
	critical: 30,
} as const;

export type ToastPriorityValue = number;

export interface ToastAction {
	label: string;
	onPress: () => void;
}

export interface ToastInput {
	message: string;
	tone?: ToastTone;
	priority?: ToastPriorityValue;
	durationMs?: number;
	dedupeKey?: string;
	action?: ToastAction;
	meta?: Record<string, unknown>;
}

export type ToastStatus = 'queued' | 'visible' | 'dismissed' | 'expired';

export interface Toast {
	id: string;
	message: string;
	tone: ToastTone;
	priority: ToastPriorityValue;
	durationMs: number;
	dedupeKey?: string;
	action?: ToastAction;
	meta?: Record<string, unknown>;
	createdAt: number;
	status: ToastStatus;
}

export interface ToastSnapshot {
	visible: readonly Toast[];
	pending: number;
	history: readonly Toast[];
}

export type ToastDismissReason = 'user' | 'expired' | 'replaced' | 'cleared';

export interface ToastEvents extends EventMap {
	show: Toast;
	dismiss: { toast: Toast; reason: ToastDismissReason };
	clear: void;
}

export interface ToastScheduler {
	set(fn: () => void, ms: number): unknown;
	clear(handle: unknown): void;
}

export interface ToastQueueOptions {
	maxVisible?: number;
	capacity?: number;
	historyCapacity?: number;
	defaultDurationMs?: number;
	now?: () => number;
	scheduler?: ToastScheduler;
}
