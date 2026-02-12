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
});
