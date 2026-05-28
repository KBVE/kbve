const EDGE_HOST = process.env['EDGE_HOST'] ?? '127.0.0.1';
const EDGE_PORT = Number(process.env['EDGE_PORT'] ?? 9100);
const DEFAULT_READY_TIMEOUT_MS = Number(
	process.env['EDGE_READY_TIMEOUT_MS'] ?? 90_000,
);

export const BASE_URL = `http://${EDGE_HOST}:${EDGE_PORT}`;

export async function waitForReady(
	timeoutMs = DEFAULT_READY_TIMEOUT_MS,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const res = await fetch(BASE_URL, {
				signal: AbortSignal.timeout(2_000),
			});
			if (res.status > 0) return;
		} catch {
			// Connection refused or reset — keep trying
		}
		await new Promise((r) => setTimeout(r, 500));
	}

	throw new Error(
		`Edge runtime not ready at ${BASE_URL} after ${timeoutMs}ms`,
	);
}
