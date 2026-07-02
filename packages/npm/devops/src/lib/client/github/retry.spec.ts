import { describe, it, expect } from 'vitest';
import { withGitHubRetry } from './retry';

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noSleep = async (): Promise<void> => {};

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
});
