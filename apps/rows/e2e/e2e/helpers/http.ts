export const BASE_URL = process.env.ROWS_E2E_URL ?? 'http://localhost:4325';

const POLL_INTERVAL_MS = 500;
const MAX_WAIT_MS = 30_000;

/**
 * Poll the /health endpoint until the server is ready or timeout.
 */
export async function waitForReady(): Promise<void> {
	const deadline = Date.now() + MAX_WAIT_MS;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${BASE_URL}/health`);
			if (res.ok) return;
		} catch {
			// server not up yet
		}
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
	}
	throw new Error(
		`ROWS server at ${BASE_URL} did not become ready within ${MAX_WAIT_MS}ms`,
	);
}
