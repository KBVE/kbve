import { describe, it, expect } from 'vitest';
import { withGitHubRetry } from './retry';

const noSleep = () => Promise.resolve();

describe('withGitHubRetry (v0.0.21)', () => {
	it('returns immediately on success', async () => {
		let calls = 0;
		const out = await withGitHubRetry(
			async () => {
				calls++;
				return 'ok';
			},
			{ sleep: noSleep },
		);
		expect(out).toBe('ok');
		expect(calls).toBe(1);
	});

	it('retries a 500 then succeeds', async () => {
		let calls = 0;
		const out = await withGitHubRetry(
			async () => {
				calls++;
				if (calls < 2) throw { status: 500 };
				return 'ok';
			},
			{ sleep: noSleep },
		);
		expect(out).toBe('ok');
		expect(calls).toBe(2);
	});

	it('does not retry a non-retryable 404', async () => {
		let calls = 0;
		await expect(
			withGitHubRetry(
				async () => {
					calls++;
					throw { status: 404 };
				},
				{ sleep: noSleep },
			),
		).rejects.toEqual({ status: 404 });
		expect(calls).toBe(1);
	});

	it('exhausts retries then throws', async () => {
		let calls = 0;
		await expect(
			withGitHubRetry(
				async () => {
					calls++;
					throw { status: 503 };
				},
				{ retries: 2, sleep: noSleep },
			),
		).rejects.toEqual({ status: 503 });
		expect(calls).toBe(3);
	});

	it('retries a secondary-rate-limit 403', async () => {
		let calls = 0;
		const out = await withGitHubRetry(
			async () => {
				calls++;
				if (calls < 2)
					throw {
						status: 403,
						message: 'You have exceeded a secondary rate limit',
					};
				return 'ok';
			},
			{ sleep: noSleep },
		);
		expect(out).toBe('ok');
		expect(calls).toBe(2);
	});

	it('honors Retry-After header over exponential backoff', async () => {
		let calls = 0;
		const delays: number[] = [];
		const recordingSleep = (ms: number): Promise<void> => {
			delays.push(ms);
			return Promise.resolve();
		};
		const out = await withGitHubRetry(
			async () => {
				calls++;
				if (calls < 2)
					throw {
						status: 403,
						message: 'secondary rate limit',
						response: { headers: { 'retry-after': '2' } },
					};
				return 'ok';
			},
			{ sleep: recordingSleep },
		);
		expect(out).toBe('ok');
		expect(calls).toBe(2);
		expect(delays).toEqual([2000]);
	});
});
