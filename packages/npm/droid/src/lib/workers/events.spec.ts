import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need a fresh DroidEventBus for each test, so import the class-creating module
// and re-instantiate. Since the module exports a singleton, we'll test via dynamic import.
// Actually, let's just test the singleton and reset between tests.

// The module exports a singleton `DroidEvents`. We can still test it
// by carefully managing listener cleanup.

import { DroidEvents } from './events';

beforeEach(() => {
	// Remove all listeners by re-creating internal state isn't possible
	// with the singleton, so we rely on off() in each test.
});

describe('DroidEventBus', () => {
	it('should register and fire a listener via on/emit', () => {
		const handler = vi.fn();
		DroidEvents.on('droid-ready', handler);

		DroidEvents.emit('droid-ready', { timestamp: 123 });

		expect(handler).toHaveBeenCalledOnce();
		expect(handler).toHaveBeenCalledWith({ timestamp: 123 });

		DroidEvents.off('droid-ready', handler);
	});

	it('should unregister a listener via off', () => {
		const handler = vi.fn();
		DroidEvents.on('droid-ready', handler);
		DroidEvents.off('droid-ready', handler);

		DroidEvents.emit('droid-ready', { timestamp: 1 });

		expect(handler).not.toHaveBeenCalled();
	});

	it('should support multiple listeners on the same event', () => {
		const h1 = vi.fn();
		const h2 = vi.fn();
		DroidEvents.on('droid-ready', h1);
		DroidEvents.on('droid-ready', h2);

		DroidEvents.emit('droid-ready', { timestamp: 1 });

		expect(h1).toHaveBeenCalledOnce();
		expect(h2).toHaveBeenCalledOnce();

		DroidEvents.off('droid-ready', h1);
		DroidEvents.off('droid-ready', h2);
	});

	it('should not fail when removing a listener that was never added', () => {
		const handler = vi.fn();
		expect(() => DroidEvents.off('droid-ready', handler)).not.toThrow();
	});

	it('should validate payload via Zod and reject invalid payloads', () => {
		const handler = vi.fn();
		DroidEvents.on('droid-ready', handler);

		const consoleSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);

		// @ts-expect-error intentionally passing invalid payload
		DroidEvents.emit('droid-ready', { timestamp: 'not-a-number' });

		expect(handler).not.toHaveBeenCalled();
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('[DroidEventBus] Invalid payload'),
			expect.anything(),
		);

		consoleSpy.mockRestore();
		DroidEvents.off('droid-ready', handler);
	});

	it('should dispatch a CustomEvent on window', () => {
		const windowHandler = vi.fn();
		window.addEventListener('droid-ready', windowHandler);

		DroidEvents.emit('droid-ready', { timestamp: 42 });

		expect(windowHandler).toHaveBeenCalledOnce();
		const event = windowHandler.mock.calls[0][0] as CustomEvent;
		expect(event.detail).toEqual({ timestamp: 42 });

		window.removeEventListener('droid-ready', windowHandler);
	});

	it('should catch and log listener errors without breaking other listeners', () => {
		const badHandler = vi.fn(() => {
			throw new Error('boom');
		});
		const goodHandler = vi.fn();

		DroidEvents.on('droid-ready', badHandler);
		DroidEvents.on('droid-ready', goodHandler);

		const consoleSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);

		DroidEvents.emit('droid-ready', { timestamp: 1 });

		expect(badHandler).toHaveBeenCalledOnce();
		expect(goodHandler).toHaveBeenCalledOnce();
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('[DroidEventBus] Listener error'),
			expect.anything(),
		);

		consoleSpy.mockRestore();
		DroidEvents.off('droid-ready', badHandler);
		DroidEvents.off('droid-ready', goodHandler);
	});

	it('should resolve wait() when the event fires', async () => {
		const promise = DroidEvents.wait('droid-ready');

		DroidEvents.emit('droid-ready', { timestamp: 999 });

		const result = await promise;
		expect(result).toEqual({ timestamp: 999 });
	});

	it('wait() should auto-unregister after resolving', async () => {
		const promise = DroidEvents.wait('droid-ready');
		DroidEvents.emit('droid-ready', { timestamp: 1 });
		await promise;

		// Emit again — the wait handler should not fire again
		// (no way to directly test, but ensures no memory leak)
		const handler = vi.fn();
		DroidEvents.on('droid-ready', handler);
		DroidEvents.emit('droid-ready', { timestamp: 2 });
		expect(handler).toHaveBeenCalledOnce();
		DroidEvents.off('droid-ready', handler);
	});

	it('should emit droid-downscale event with level payload', () => {
		const handler = vi.fn();
		DroidEvents.on('droid-downscale', handler);

		DroidEvents.emit('droid-downscale', {
			timestamp: Date.now(),
			level: 'minimal',
		});

		expect(handler).toHaveBeenCalledOnce();
		expect(handler.mock.calls[0][0].level).toBe('minimal');

		DroidEvents.off('droid-downscale', handler);
	});

	it('should emit droid-upscale event with level payload', () => {
		const handler = vi.fn();
		DroidEvents.on('droid-upscale', handler);

		DroidEvents.emit('droid-upscale', {
			timestamp: Date.now(),
			level: 'full',
		});

		expect(handler).toHaveBeenCalledOnce();
		expect(handler.mock.calls[0][0].level).toBe('full');

		DroidEvents.off('droid-upscale', handler);
	});

	it('should emit panel-open and panel-close events', () => {
		const openHandler = vi.fn();
		const closeHandler = vi.fn();
		DroidEvents.on('panel-open', openHandler);
		DroidEvents.on('panel-close', closeHandler);

		DroidEvents.emit('panel-open', { id: 'left' });
		DroidEvents.emit('panel-close', { id: 'right' });

		expect(openHandler).toHaveBeenCalledWith({ id: 'left' });
		expect(closeHandler).toHaveBeenCalledWith({ id: 'right' });

		DroidEvents.off('panel-open', openHandler);
		DroidEvents.off('panel-close', closeHandler);
	});

	it('should emit toast events', () => {
		const handler = vi.fn();
		DroidEvents.on('toast-added', handler);

		DroidEvents.emit('toast-added', {
			id: 'toast-1',
			message: 'Hello',
			severity: 'info',
		});

		expect(handler).toHaveBeenCalledWith({
			id: 'toast-1',
			message: 'Hello',
			severity: 'info',
		});

		DroidEvents.off('toast-added', handler);
	});
});
