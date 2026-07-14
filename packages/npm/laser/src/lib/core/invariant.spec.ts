import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { laserEvents } from './events';
import {
	invariant,
	resetInvariants,
	setInvariantThrottle,
	INVARIANT_EVENT,
	type InvariantViolation,
} from './invariant';

describe('invariant', () => {
	let err: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		resetInvariants();
		setInvariantThrottle(0);
		err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	afterEach(() => {
		err.mockRestore();
		setInvariantThrottle(1000);
	});

	it('passes silently when the condition holds', () => {
		const seen = vi.fn();
		const off = laserEvents.on(INVARIANT_EVENT, seen);
		expect(invariant(true, 'ok')).toBe(true);
		expect(seen).not.toHaveBeenCalled();
		expect(err).not.toHaveBeenCalled();
		off();
	});

	it('returns false and emits a structured event on violation', () => {
		const seen = vi.fn();
		const off = laserEvents.on(INVARIANT_EVENT, seen);
		expect(invariant(false, 'broke', { eid: 5 })).toBe(false);
		expect(err).toHaveBeenCalledTimes(1);
		expect(seen).toHaveBeenCalledTimes(1);
		const v = seen.mock.calls[0][0] as InvariantViolation;
		expect(v.msg).toBe('broke');
		expect(v.ctx).toEqual({ eid: 5 });
		expect(v.count).toBe(1);
		off();
	});

	it('counts repeated violations of the same message', () => {
		const seen = vi.fn();
		const off = laserEvents.on(INVARIANT_EVENT, seen);
		invariant(false, 'dup');
		invariant(false, 'dup');
		expect(seen).toHaveBeenCalledTimes(2);
		const second = seen.mock.calls[1][0] as InvariantViolation;
		expect(second.count).toBe(2);
		off();
	});

	it('throttles repeat emits within the window', () => {
		setInvariantThrottle(100000);
		const seen = vi.fn();
		const off = laserEvents.on(INVARIANT_EVENT, seen);
		invariant(false, 'spammy');
		invariant(false, 'spammy');
		invariant(false, 'spammy');
		expect(seen).toHaveBeenCalledTimes(1);
		off();
	});

	it('treats distinct messages independently', () => {
		const seen = vi.fn();
		const off = laserEvents.on(INVARIANT_EVENT, seen);
		invariant(false, 'a');
		invariant(false, 'b');
		expect(seen).toHaveBeenCalledTimes(2);
		off();
	});
});
