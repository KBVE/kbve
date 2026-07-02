export interface GitHubRetryOptions {
	retries?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

function retryAfterMs(err: unknown): number | null {
	const e = err as {
		response?: { headers?: Record<string, unknown> };
		headers?: Record<string, unknown>;
	};
	const raw =
		e?.response?.headers?.['retry-after'] ?? e?.headers?.['retry-after'];
	if (raw == null) {
		return null;
	}
	const secs = parseInt(String(raw), 10);
	return Number.isFinite(secs) ? secs * 1000 : null;
}

function isRetryable(err: unknown): boolean {
	const e = err as {
		status?: number;
		response?: { status?: number };
		message?: string;
		code?: string;
	};
	const status = e?.status ?? e?.response?.status;
	if (status === 429) {
		return true;
	}
	if (typeof status === 'number' && status >= 500) {
		return true;
	}
	if (status === 403) {
		const msg = String(e?.message ?? '').toLowerCase();
		return (
			msg.includes('rate limit') ||
			msg.includes('abuse') ||
			retryAfterMs(err) !== null
		);
	}
	return (
		e?.code === 'ETIMEDOUT' ||
		e?.code === 'ECONNRESET' ||
		e?.code === 'ENOTFOUND'
	);
}

export async function withGitHubRetry<T>(
	fn: () => Promise<T>,
	opts: GitHubRetryOptions = {},
): Promise<T> {
	const retries = opts.retries ?? 3;
	const baseDelayMs = opts.baseDelayMs ?? 1000;
	const maxDelayMs = opts.maxDelayMs ?? 30000;
	const sleep = opts.sleep ?? defaultSleep;

	let attempt = 0;
	for (;;) {
		try {
			return await fn();
		} catch (err) {
			if (attempt >= retries || !isRetryable(err)) {
				throw err;
			}
			const backoff = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
			const delay = retryAfterMs(err) ?? backoff;
			await sleep(delay);
			attempt++;
		}
	}
}
