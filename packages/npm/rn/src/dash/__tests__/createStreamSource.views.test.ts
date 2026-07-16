import { describe, it, expect, vi } from 'vitest';
import { createStreamSource } from '../createStreamSource';

function make() {
	return createStreamSource<{ id: string }, { id: string }>({
		key: 'vt',
		initialParams: { minutes: 60 },
		defaultViews: [{ id: 'errors', name: 'Errors', params: { minutes: 1440, level: 'error' }, seeded: true }],
		fetch: async () => [],
		normalize: (r) => r,
		id: (i) => i.id,
	});
}

describe('createStreamSource saved views', () => {
	it('saveView snapshots current params', () => {
		const store = make();
		store.setParams({ minutes: 720 });
		store.saveView('Half day');
		const saved = store.get().views.find((v) => v.name === 'Half day');
		expect(saved?.params).toEqual({ minutes: 720 });
	});

	it('applyView sets params from the view', async () => {
		const store = make();
		store.saveView('snap'); // snapshot minutes:60
		store.setParams({ minutes: 999 });
		const id = store.get().views.find((v) => v.name === 'snap')!.id;
		store.applyView(id);
		expect(store.get().params.minutes).toBe(60);
		expect(store.get().activeViewId).toBe(id);
	});

	it('exportViews/importViews round-trips', () => {
		const store = make();
		store.saveView('a');
		const json = store.exportViews();
		const n = store.importViews(json);
		expect(n).toBeGreaterThan(0);
	});

	it('importViews returns 0 on bad JSON without throwing', () => {
		const store = make();
		expect(store.importViews('nope')).toBe(0);
	});
});
