const FC_HOST = process.env['FC_HOST'] ?? '127.0.0.1';
const FC_PORT = Number(process.env['FC_PORT'] ?? 19001);

export const BASE_URL = `http://${FC_HOST}:${FC_PORT}`;

/**
 * Poll until firecracker-ctl responds to HTTP requests.
 * TCP-only checks are insufficient — the server accepts TCP
 * connections before the HTTP handler is fully initialized.
 */
export async function waitForReady(timeoutMs = 60_000): Promise<void> {
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
		`firecracker-ctl server not ready at ${BASE_URL} after ${timeoutMs}ms`,
	);
}
