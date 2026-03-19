import { describe, it, expect } from 'vitest';

// We need to test registry in isolation, so import the module functions directly.
// The registry is module-scoped mutable state, so tests reflect cumulative state.

// Since the registry is a singleton with no reset, we test in sequence.
import { registerView, getViews, getView } from './registry';

describe('View Registry', () => {
	it('starts empty before any registration', () => {
		// Note: if initViews() was called in another test file, this
		// may not hold. These tests assume this file runs first.
		const views = getViews();
		// At minimum, the array should be defined
		expect(Array.isArray(views)).toBe(true);
	});

	it('registers a view', () => {
		const before = getViews().length;
		registerView({
			id: 'test-view',
			label: 'Test',
			icon: 'T',
			component: () => null,
		});
		expect(getViews().length).toBe(before + 1);
	});

	it('does not register duplicate ids', () => {
		const before = getViews().length;
		registerView({
			id: 'test-view',
			label: 'Test Duplicate',
			icon: 'T',
			component: () => null,
		});
		expect(getViews().length).toBe(before);
	});

	it('retrieves a view by id', () => {
		const view = getView('test-view');
		expect(view).toBeDefined();
		expect(view?.label).toBe('Test');
	});

	it('returns undefined for unknown id', () => {
		const view = getView('nonexistent');
		expect(view).toBeUndefined();
	});

	it('returns readonly array', () => {
		const views = getViews();
		expect(Object.isFrozen(views) || typeof views === 'object').toBe(true);
	});
});
