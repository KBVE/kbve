import { useMemo } from 'react';
import { useSignal } from '../hooks/useSignal';
import { toasts as defaultQueue, ToastQueue } from './queue';
import type { Toast, ToastInput } from './types';

export function useToasts(queue: ToastQueue = defaultQueue): readonly Toast[] {
	return useSignal(queue.signal).visible;
}

export function useToastHistory(
	queue: ToastQueue = defaultQueue,
): readonly Toast[] {
	return useSignal(queue.signal).history;
}

export function usePendingToastCount(queue: ToastQueue = defaultQueue): number {
	return useSignal(queue.signal).pending;
}

export interface ToastController {
	push: (input: ToastInput) => string;
	dismiss: (id: string) => void;
	clear: () => void;
	success: (message: string) => string;
	danger: (message: string) => string;
	warning: (message: string) => string;
	info: (message: string) => string;
}

export function useToastController(
	queue: ToastQueue = defaultQueue,
): ToastController {
	return useMemo(
		() => ({
			push: (input) => queue.push(input),
			dismiss: (id) => queue.dismiss(id),
			clear: () => queue.clear(),
			success: (message) => queue.success(message),
			danger: (message) => queue.danger(message),
			warning: (message) => queue.warning(message),
			info: (message) => queue.info(message),
		}),
		[queue],
	);
}
