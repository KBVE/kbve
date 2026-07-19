import { describe, it, expect } from 'vitest';
import { formatCountdown } from '../countdown';

describe('formatCountdown', () => {
	it('expired', () => {
		expect(
			formatCountdown({
				expired: true,
				days: 0,
				hours: 0,
				minutes: 0,
				seconds: 0,
				totalMs: 0,
			}),
		).toBe('expired');
	});
	it('days/hours/minutes/seconds tiers', () => {
		expect(
			formatCountdown({
				expired: false,
				days: 2,
				hours: 3,
				minutes: 0,
				seconds: 0,
				totalMs: 1,
			}),
		).toBe('2d 3h');
		expect(
			formatCountdown({
				expired: false,
				days: 0,
				hours: 5,
				minutes: 9,
				seconds: 0,
				totalMs: 1,
			}),
		).toBe('5h 9m');
		expect(
			formatCountdown({
				expired: false,
				days: 0,
				hours: 0,
				minutes: 4,
				seconds: 3,
				totalMs: 1,
			}),
		).toBe('4m 03s');
		expect(
			formatCountdown({
				expired: false,
				days: 0,
				hours: 0,
				minutes: 0,
				seconds: 8,
				totalMs: 1,
			}),
		).toBe('8s');
	});
});
