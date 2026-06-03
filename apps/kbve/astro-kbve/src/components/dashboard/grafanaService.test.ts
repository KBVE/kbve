import { describe, it, expect } from 'vitest';
import { formatBytes, getThresholdColor } from './grafanaService';

describe('grafanaService — formatBytes', () => {
	it('returns -- for null', () => {
		expect(formatBytes(null)).toBe('--');
	});

	it('B/s under 1 KB', () => {
		expect(formatBytes(0)).toBe('0 B/s');
		expect(formatBytes(999)).toBe('999 B/s');
	});

	it('KB/s in the 1k..1M range', () => {
		expect(formatBytes(1_000)).toBe('1.0 KB/s');
		expect(formatBytes(900_000)).toBe('900.0 KB/s');
	});

	it('MB/s in the 1M..1G range', () => {
		expect(formatBytes(1_000_000)).toBe('1.0 MB/s');
		expect(formatBytes(15_500_000)).toBe('15.5 MB/s');
	});

	it('GB/s at or above 1G', () => {
		expect(formatBytes(1_000_000_000)).toBe('1.0 GB/s');
		expect(formatBytes(2_500_000_000)).toBe('2.5 GB/s');
	});
});

describe('grafanaService — getThresholdColor', () => {
	const thresholds = { warn: 70, crit: 90 };

	it('green below warn', () => {
		expect(getThresholdColor(0, thresholds)).toBe('#22c55e');
		expect(getThresholdColor(69.9, thresholds)).toBe('#22c55e');
	});

	it('yellow at + above warn, below crit', () => {
		expect(getThresholdColor(70, thresholds)).toBe('#eab308');
		expect(getThresholdColor(89.9, thresholds)).toBe('#eab308');
	});

	it('red at + above crit', () => {
		expect(getThresholdColor(90, thresholds)).toBe('#ef4444');
		expect(getThresholdColor(100, thresholds)).toBe('#ef4444');
	});

	it('crit takes precedence over warn when both met', () => {
		expect(getThresholdColor(100, { warn: 50, crit: 60 })).toBe('#ef4444');
	});
});
