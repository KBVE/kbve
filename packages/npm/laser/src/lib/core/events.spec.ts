import { describe, it, expect, vi } from 'vitest';
import { LaserEventBus } from './events';

interface TestEvents {
	ping: { value: number };
	pong: void;
}

describe('LaserEventBus', () => {
	it('should call handler when event is emitted', () => {
		const bus = new LaserEventBus<TestEvents>();
		const handler = vi.fn();
		bus.on('ping', handler);
		bus.emit('ping', { value: 42 });
		expect(handler).toHaveBeenCalledWith({ value: 42 });
	});

	it('should support void events', () => {
		const bus = new LaserEventBus<TestEvents>();
		const handler = vi.fn();
		bus.on('pong', handler);
		bus.emit('pong', undefined as never);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it('should unsubscribe via returned function', () => {
		const bus = new LaserEventBus<TestEvents>();
		const handler = vi.fn();
		const unsub = bus.on('ping', handler);
		unsub();
		bus.emit('ping', { value: 1 });
		expect(handler).not.toHaveBeenCalled();
	});

	it('should unsubscribe via off()', () => {
		const bus = new LaserEventBus<TestEvents>();
		const handler = vi.fn();
		bus.on('ping', handler);
		bus.off('ping', handler);
		bus.emit('ping', { value: 1 });
		expect(handler).not.toHaveBeenCalled();
	});

	it('should support multiple handlers for the same event', () => {
		const bus = new LaserEventBus<TestEvents>();
		const h1 = vi.fn();
		const h2 = vi.fn();
		bus.on('ping', h1);
		bus.on('ping', h2);
		bus.emit('ping', { value: 10 });
		expect(h1).toHaveBeenCalledWith({ value: 10 });
		expect(h2).toHaveBeenCalledWith({ value: 10 });
	});

	it('should clear all handlers', () => {
		const bus = new LaserEventBus<TestEvents>();
		const handler = vi.fn();
		bus.on('ping', handler);
		bus.clear();
		bus.emit('ping', { value: 1 });
		expect(handler).not.toHaveBeenCalled();
	});

	it('should not throw when emitting with no listeners', () => {
		const bus = new LaserEventBus<TestEvents>();
		expect(() => bus.emit('ping', { value: 1 })).not.toThrow();
	});

	it('should not throw when removing non-existent handler', () => {
		const bus = new LaserEventBus<TestEvents>();
		const handler = vi.fn();
		expect(() => bus.off('ping', handler)).not.toThrow();
	});

	it('isolates a throwing handler from the others and the emitter', () => {
		const bus = new LaserEventBus<TestEvents>();
		const err = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const boom = vi.fn(() => {
			throw new Error('boom');
		});
		const after = vi.fn();
		bus.on('ping', boom);
		bus.on('ping', after);
		expect(() => bus.emit('ping', { value: 1 })).not.toThrow();
		expect(after).toHaveBeenCalledWith({ value: 1 });
		expect(err).toHaveBeenCalled();
		err.mockRestore();
	});

	it('routes handler errors to onError sinks instead of console', () => {
		const bus = new LaserEventBus<TestEvents>();
		const err = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const sink = vi.fn();
		bus.onError(sink);
		bus.on('ping', () => {
			throw new Error('x');
		});
		bus.emit('ping', { value: 7 });
		expect(sink).toHaveBeenCalledTimes(1);
		expect(sink.mock.calls[0][1]).toBe('ping');
		expect(err).not.toHaveBeenCalled();
		err.mockRestore();
	});

	it('once() fires exactly once then auto-unsubscribes', () => {
		const bus = new LaserEventBus<TestEvents>();
		const handler = vi.fn();
		bus.once('ping', handler);
		bus.emit('ping', { value: 1 });
		bus.emit('ping', { value: 2 });
		expect(handler).toHaveBeenCalledTimes(1);
		expect(handler).toHaveBeenCalledWith({ value: 1 });
	});

	it('survives a handler that unsubscribes another mid-emit', () => {
		const bus = new LaserEventBus<TestEvents>();
		const h2 = vi.fn();
		const off2 = bus.on('ping', h2);
		bus.on('ping', () => off2());
		expect(() => bus.emit('ping', { value: 1 })).not.toThrow();
	});

	it('records an emit history ring once enabled', () => {
		const bus = new LaserEventBus<TestEvents>();
		bus.setDebug({ historySize: 2 });
		bus.emit('ping', { value: 1 });
		bus.emit('ping', { value: 2 });
		bus.emit('ping', { value: 3 });
		const hist = bus.getHistory();
		expect(hist.length).toBe(2);
		expect(hist.map((r) => (r.data as { value: number }).value)).toEqual([
			2, 3,
		]);
	});

	it('reports listenerCount and eventNames', () => {
		const bus = new LaserEventBus<TestEvents>();
		bus.on('ping', () => undefined);
		bus.on('ping', () => undefined);
		expect(bus.listenerCount('ping')).toBe(2);
		expect(bus.eventNames()).toContain('ping');
	});
});
