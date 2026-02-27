const EDGE_HOST = process.env['EDGE_HOST'] ?? '127.0.0.1';
const EDGE_PORT = Number(process.env['EDGE_PORT'] ?? 9100);

export const BASE_URL = `http://${EDGE_HOST}:${EDGE_PORT}`;

/**
 * Poll until the edge runtime responds to HTTP requests.
 * TCP-only checks are insufficient — the runtime accepts TCP
 * connections before the HTTP server is fully initialized.
 */
export async function waitForReady(timeoutMs = 30_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const res = await fetch(BASE_URL, {
				signal: AbortSignal.timeout(2_000),
			});
			// Any HTTP response (even 400/401) means the server is ready
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
