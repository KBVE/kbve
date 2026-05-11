import { describe, it, expect, vi, afterEach } from 'vitest';
import { reconnectDelayMs } from './ws-worker';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('reconnectDelayMs', () => {
	it('returns base delay on first attempt', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		expect(reconnectDelayMs(1)).toBe(1000);
	});

	it('doubles each attempt', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		expect(reconnectDelayMs(1)).toBe(1000);
		expect(reconnectDelayMs(2)).toBe(2000);
		expect(reconnectDelayMs(3)).toBe(4000);
		expect(reconnectDelayMs(4)).toBe(8000);
		expect(reconnectDelayMs(5)).toBe(16000);
	});

	it('caps at the 30s ceiling', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		expect(reconnectDelayMs(10)).toBe(30000);
		expect(reconnectDelayMs(100)).toBe(30000);
	});

	it('adds jitter up to 500ms', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.99999);
		const delay = reconnectDelayMs(1);
		expect(delay).toBeGreaterThanOrEqual(1000);
		expect(delay).toBeLessThan(1500);
	});

	it('treats 0 and negative attempts as the first attempt', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		expect(reconnectDelayMs(0)).toBe(1000);
		expect(reconnectDelayMs(-5)).toBe(1000);
	});
});
