import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { useToastStore, toast } from './toastStore';

describe('Toast Store', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		useToastStore.setState({ toasts: [] });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('adds a toast with type defaults', () => {
		const id = toast.success('Done');
		const toasts = useToastStore.getState().toasts;
		expect(toasts).toHaveLength(1);
		expect(toasts[0].id).toBe(id);
		expect(toasts[0].type).toBe('success');
		expect(toasts[0].duration).toBe(5000);
	});

	it('auto-dismisses after the duration', () => {
		toast.info('Heads up');
		expect(useToastStore.getState().toasts).toHaveLength(1);
		vi.advanceTimersByTime(6001);
		expect(useToastStore.getState().toasts).toHaveLength(0);
	});

	it('keeps only the newest three toasts', () => {
		toast.info('one');
		vi.advanceTimersByTime(1);
		toast.info('two');
		vi.advanceTimersByTime(1);
		toast.info('three');
		vi.advanceTimersByTime(1);
		toast.info('four');
		const titles = useToastStore.getState().toasts.map((t) => t.title);
		expect(titles).toHaveLength(3);
		expect(titles).not.toContain('one');
	});

	it('removes a toast by id and clears all', () => {
		const id = toast.error('boom');
		toast.warning('careful');
		toast.dismiss(id);
		expect(
			useToastStore.getState().toasts.find((t) => t.id === id),
		).toBeUndefined();
		toast.clear();
		expect(useToastStore.getState().toasts).toHaveLength(0);
	});

	it('persistent toast (duration 0) never auto-dismisses', () => {
		toast.info('sticky', undefined, 0);
		vi.advanceTimersByTime(60_000);
		expect(useToastStore.getState().toasts).toHaveLength(1);
	});
});
