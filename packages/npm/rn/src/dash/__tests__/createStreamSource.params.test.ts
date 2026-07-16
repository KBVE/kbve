import { describe, it, expect, vi } from 'vitest';
import { createStreamSource } from '../createStreamSource';

function make(fetchSpy: (params: unknown) => Promise<unknown[]>) {
	return createStreamSource<{ id: string }, { id: string }>({
		key: 'test',
		initialParams: { minutes: 60 },
		fetch: (_ctx, params) => fetchSpy(params) as Promise<{ id: string }[]>,
		normalize: (r) => r,
		id: (i) => i.id,
	});
}

describe('createStreamSource params', () => {
	it('passes initialParams to fetch', async () => {
		const spy = vi.fn(async () => []);
		const store = make(spy);
		await store.refresh();
		expect(spy).toHaveBeenCalledWith({ minutes: 60 });
	});

	it('setParams merges and refetches with new params', async () => {
		const spy = vi.fn(async () => []);
		const store = make(spy);
		await store.refresh();
		store.setParams({ minutes: 360, level: 'error' });
		// setParams triggers an async refetch; flush microtasks
		await Promise.resolve();
		await Promise.resolve();
		expect(spy).toHaveBeenLastCalledWith({ minutes: 360, level: 'error' });
		expect(store.get().params).toEqual({ minutes: 360, level: 'error' });
	});

	it('resetParams restores initialParams', async () => {
		const spy = vi.fn(async () => []);
		const store = make(spy);
		store.setParams({ minutes: 1440 });
		store.resetParams();
		await Promise.resolve();
		await Promise.resolve();
		expect(store.get().params).toEqual({ minutes: 60 });
	});
});
