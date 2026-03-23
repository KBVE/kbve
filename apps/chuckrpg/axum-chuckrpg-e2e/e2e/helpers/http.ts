const HOST = process.env['AXUM_HOST'] ?? '127.0.0.1';
const PORT = Number(process.env['AXUM_PORT'] ?? 4324);

export const BASE_URL = `http://${HOST}:${PORT}`;

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
		`axum-chuckrpg server not ready at ${BASE_URL} after ${timeoutMs}ms`,
	);
}
