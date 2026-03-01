const AXUM_HOST = process.env['AXUM_HOST'] ?? '127.0.0.1';
const AXUM_PORT = Number(process.env['AXUM_PORT'] ?? 4323);

export const BASE_URL = `http://${AXUM_HOST}:${AXUM_PORT}`;

/**
 * Poll until the axum-kbve server responds to HTTP requests.
 * TCP-only checks are insufficient — the server accepts TCP
 * connections before the HTTP handler is fully initialized.
 */
export async function waitForReady(timeoutMs = 30_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${BASE_URL}/health`, {
				signal: AbortSignal.timeout(2_000),
			});
			if (res.status > 0) return;
		} catch {
			// Connection refused or reset — keep trying
		}
		await new Promise((r) => setTimeout(r, 500));
	}

	throw new Error(
		`axum-kbve server not ready at ${BASE_URL} after ${timeoutMs}ms`,
	);
}
