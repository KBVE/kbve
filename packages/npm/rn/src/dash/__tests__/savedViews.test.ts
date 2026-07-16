import { describe, it, expect } from 'vitest';
import {
	seedViews, addView, removeView, renameView,
	reorderViews, exportViews, importViews, makeViewId,
} from '../savedViews';
import type { SavedView } from '../types';

const v = (id: string, name = id): SavedView => ({ id, name, params: { minutes: 360 } });

describe('savedViews', () => {
	it('seeds defaults, user views win on id', () => {
		const seeded = [{ ...v('errors-24h'), seeded: true }];
		const stored = [{ ...v('errors-24h'), name: 'My Errors' }];
		const out = seedViews(seeded, stored);
		expect(out).toHaveLength(1);
		expect(out[0].name).toBe('My Errors');
	});

	it('keeps seeded views not overridden by user', () => {
		const seeded = [{ ...v('a'), seeded: true }, { ...v('b'), seeded: true }];
		const out = seedViews(seeded, [{ ...v('a'), name: 'Custom A' }]);
		expect(out.map((x) => x.id).sort()).toEqual(['a', 'b']);
		expect(out.find((x) => x.id === 'a')!.name).toBe('Custom A');
	});

	it('adds, renames, removes, reorders', () => {
		let list = addView([], v('x'));
		list = addView(list, v('y'));
		list = renameView(list, 'x', 'X2');
		expect(list.find((i) => i.id === 'x')!.name).toBe('X2');
		list = reorderViews(list, ['y', 'x']);
		expect(list.map((i) => i.id)).toEqual(['y', 'x']);
		list = removeView(list, 'y');
		expect(list.map((i) => i.id)).toEqual(['x']);
	});

	it('round-trips export/import', () => {
		const list = [v('a'), v('b')];
		expect(importViews(exportViews(list))).toEqual(list);
	});

	it('throws on bad import JSON', () => {
		expect(() => importViews('not json')).toThrow();
	});

	it('makeViewId is deterministic and unique-ish', () => {
		expect(makeViewId('Errors 24h', 0)).toBe(makeViewId('Errors 24h', 0));
		expect(makeViewId('Errors 24h', 0)).not.toBe(makeViewId('Errors 24h', 1));
	});
});
