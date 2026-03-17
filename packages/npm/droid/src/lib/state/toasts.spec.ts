import { describe, it, expect, vi, beforeEach } from 'vitest';
import { $toasts, addToast, removeToast } from './toasts';
import { DroidEvents } from '../workers/events';
import type { ToastPayload } from '../types/ui-event-types';

beforeEach(() => {
	$toasts.set({});
	// Reset the toast queue
	(window as Record<string, unknown>).__kbveToastQueue = undefined;
});

const makeToast = (
	id: string,
	overrides?: Partial<ToastPayload>,
): ToastPayload => ({
	id,
	message: `Toast ${id}`,
	severity: 'info',
	...overrides,
});

describe('addToast', () => {
	it('adds toast to the nanostore', () => {
		addToast(makeToast('t1'));
		expect($toasts.get()).toHaveProperty('t1');
		expect($toasts.get()['t1'].message).toBe('Toast t1');
	});

	it('adds multiple toasts', () => {
		addToast(makeToast('t1'));
		addToast(makeToast('t2', { severity: 'error' }));

		const state = $toasts.get();
		expect(Object.keys(state)).toHaveLength(2);
		expect(state['t2'].severity).toBe('error');
	});

	it('emits toast-added event', () => {
		const handler = vi.fn();
		DroidEvents.on('toast-added', handler);

		const toast = makeToast('t1');
		addToast(toast);

		expect(handler).toHaveBeenCalledWith(toast);
		DroidEvents.off('toast-added', handler);
	});

	it('pushes to the pre-mount queue', () => {
		addToast(makeToast('t1'));

		const queue = (window as Record<string, unknown>)
			.__kbveToastQueue as ToastPayload[];
		expect(queue).toHaveLength(1);
		expect(queue[0].id).toBe('t1');
	});

	it('does not push to queue when queue is drained (null)', () => {
		(window as Record<string, unknown>).__kbveToastQueue = null;

		addToast(makeToast('t1'));

		expect((window as Record<string, unknown>).__kbveToastQueue).toBeNull();
		// But the nanostore should still have it
		expect($toasts.get()).toHaveProperty('t1');
	});
});

describe('removeToast', () => {
	it('removes toast from the nanostore', () => {
		addToast(makeToast('t1'));
		addToast(makeToast('t2'));

		removeToast('t1');

		expect($toasts.get()).not.toHaveProperty('t1');
		expect($toasts.get()).toHaveProperty('t2');
	});

	it('emits toast-removed event', () => {
		const handler = vi.fn();
		DroidEvents.on('toast-removed', handler);

		addToast(makeToast('t1'));
		removeToast('t1');

		expect(handler).toHaveBeenCalledWith({ id: 't1' });
		DroidEvents.off('toast-removed', handler);
	});

	it('removes toast from the pre-mount queue', () => {
		addToast(makeToast('t1'));
		addToast(makeToast('t2'));

		removeToast('t1');

		const queue = (window as Record<string, unknown>)
			.__kbveToastQueue as ToastPayload[];
		expect(queue).toHaveLength(1);
		expect(queue[0].id).toBe('t2');
	});

	it('handles removing a non-existent toast gracefully', () => {
		expect(() => removeToast('non-existent')).not.toThrow();
	});
});
