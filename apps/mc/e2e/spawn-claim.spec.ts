import { describe, it, expect, beforeAll } from 'vitest';
import { waitForRcon } from './helpers/rcon';
import { dockerLogs } from './helpers/docker';

const SPAWN_CLAIM_LOG =
	/\[spawn-autoclaim\] dimension=minecraft:overworld chunks=\(-13,-13\)\.\.\(12,12\) claimed=(\d+) skipped=(\d+) failed=(\d+)/;

const EXPECTED_TOTAL = 26 * 26;

async function waitForClaimLog(
	timeoutMs = 60_000,
	intervalMs = 1_000,
): Promise<RegExpMatchArray> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const match = dockerLogs().match(SPAWN_CLAIM_LOG);
		if (match) return match;
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	throw new Error(
		`spawn-autoclaim summary log not seen within ${timeoutMs}ms`,
	);
}

describe('SpawnAutoClaim boot regression', () => {
	let match: RegExpMatchArray;

	beforeAll(async () => {
		await waitForRcon();
		match = await waitForClaimLog();
	});

	it('OPAC mod is loaded', () => {
		const logs = dockerLogs();
		expect(logs).not.toMatch(/\[spawn-autoclaim\] OPAC not loaded/);
	});

	it('OPAC API reflection bound cleanly', () => {
		const logs = dockerLogs();
		expect(logs).not.toMatch(
			/\[spawn-autoclaim\] OPAC API signature mismatch|\[spawn-autoclaim\] OPAC bootstrap failed/,
		);
	});

	it('claims the full 26x26 chunk square at spawn', () => {
		const claimed = parseInt(match[1], 10);
		const skipped = parseInt(match[2], 10);
		const failed = parseInt(match[3], 10);
		expect(failed).toBe(0);
		expect(claimed + skipped).toBe(EXPECTED_TOTAL);
	});

	it('first-boot claim covers the cube without skips', () => {
		const claimed = parseInt(match[1], 10);
		expect(claimed).toBe(EXPECTED_TOTAL);
	});
});
