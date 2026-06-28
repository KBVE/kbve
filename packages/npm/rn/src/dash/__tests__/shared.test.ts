import { describe, it, expect } from 'vitest';
import {
	formatAgo,
	formatAge,
	formatDuration,
	formatBytes,
	formatSize,
	statusTone,
	statusColor,
	num,
} from '../shared';

describe('Shared Dashboard Utilities', () => {
	describe('Time Formatting', () => {
		it('formatAgo formats recent timestamps', () => {
			const now = new Date();
			const tenSecondsAgo = new Date(now.getTime() - 10 * 1000);
			const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
			const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000);

			expect(formatAgo(tenSecondsAgo)).toMatch(/\d+s ago/);
			expect(formatAgo(fiveMinutesAgo)).toMatch(/\d+m ago/);
			expect(formatAgo(twoHoursAgo)).toMatch(/\d+h ago/);
		});

		it('formatAge formats durations', () => {
			const now = new Date();
			const thirtySecondsAgo = new Date(
				now.getTime() - 30 * 1000,
			).toISOString();
			const tenMinutesAgo = new Date(
				now.getTime() - 10 * 60 * 1000,
			).toISOString();
			const oneHourAgo = new Date(
				now.getTime() - 3600 * 1000,
			).toISOString();

			expect(formatAge(thirtySecondsAgo)).toMatch(/\d+s/);
			expect(formatAge(tenMinutesAgo)).toMatch(/\d+m/);
			expect(formatAge(oneHourAgo)).toMatch(/\d+h/);
		});

		it('formatDuration converts seconds to readable format', () => {
			expect(formatDuration(30)).toBe('0m');
			expect(formatDuration(120)).toBe('2m');
			expect(formatDuration(3660)).toBe('1h 1m');
			expect(formatDuration(7200)).toBe('2h 0m');
		});
	});

	describe('Size Formatting', () => {
		it('formatBytes formats byte counts', () => {
			expect(formatBytes(500)).toBe('500 B');
			expect(formatBytes(1024)).toBe('1.0 KB');
			expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
			expect(formatBytes(1024 * 1024 * 1024)).toBe('1.00 GB');
		});

		it('formatSize formats KB values', () => {
			expect(formatSize(500)).toBe('500 KB');
			expect(formatSize(1024)).toBe('1.0 MB');
			expect(formatSize(1024 * 1024)).toBe('1.00 GB');
		});
	});

	describe('Status Helpers', () => {
		it('statusTone maps status to badge tones', () => {
			expect(statusTone('ok')).toBe('success');
			expect(statusTone('success')).toBe('success');
			expect(statusTone('error')).toBe('danger');
			expect(statusTone('warning')).toBe('warning');
			expect(statusTone('pending')).toBe('neutral');
			expect(statusTone('neutral')).toBe('neutral');
		});

		it('statusColor maps status to colors', () => {
			expect(statusColor('ok')).toBeTruthy();
			expect(statusColor('error')).toBeTruthy();
			expect(statusColor('warning')).toBeTruthy();
		});
	});

	describe('Number Coercion', () => {
		it('num coerces values to numbers', () => {
			expect(num(42)).toBe(42);
			expect(num('42')).toBe(42);
			expect(num('invalid')).toBe(0);
			expect(num(null)).toBe(0);
			expect(num(undefined)).toBe(0);
		});
	});
});
