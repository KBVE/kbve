const BOT_HOST = process.env['BOT_HOST'] ?? '127.0.0.1';
const BOT_PORT = Number(process.env['BOT_PORT'] ?? 4322);

export const BASE_URL = `http://${BOT_HOST}:${BOT_PORT}`;

/**
 * Poll until the discordsh-bot health server responds.
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
		`discordsh-bot health server not ready at ${BASE_URL} after ${timeoutMs}ms`,
	);
}
