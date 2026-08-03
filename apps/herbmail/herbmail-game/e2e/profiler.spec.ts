import { test, expect, type Page } from '@playwright/test';

// Guards the profiler itself against the packed build, and doubles as the
// worked example for driving it: every check here is a step an agent chasing a
// real stall or animation bug would take by hand.
interface Series {
	n: number;
	median: number;
	p99: number;
	max: number;
}

interface Report {
	ms: number;
	frames: {
		frames: Series;
		spikes: { t: number; dt: number; attributed: Record<string, number> }[];
		spikeCount: number;
	};
	gl: { name: string; calls: number; total: number; max: number }[];
	pose: { name: string; degrees: Series; jumps: number }[];
}

declare global {
	interface Window {
		__profiler: {
			start: (o?: { gl?: boolean; spikeMs?: number }) => string;
			stop: () => Report;
			report: () => Report;
			watchPose: (n: string[], o?: { near?: unknown }) => string;
		};
		__coll?: { pos: { x: number; y: number; z: number } };
	}
}

async function enterDungeon(page: Page): Promise<void> {
	await page.goto('/', { waitUntil: 'load' });
	await page.getByText('Play', { exact: true }).click({ timeout: 60_000 });
	await page.waitForFunction(
		() => typeof window.__coll?.pos === 'object',
		undefined,
		{
			timeout: 90_000,
		},
	);
}

test.describe('profiler', () => {
	test('is reachable in a production build', async ({ page }) => {
		await page.goto('/', { waitUntil: 'load' });
		const kind = await page.evaluate(() => typeof window.__profiler?.start);
		expect(kind).toBe('function');
	});

	test('collects frames and attributes GL work while the game runs', async ({
		page,
	}) => {
		await enterDungeon(page);
		expect(await page.evaluate(() => window.__profiler.start())).toBe(
			'profiler started',
		);
		await page.waitForTimeout(4000);
		const report = await page.evaluate(() => window.__profiler.stop());

		expect(report.frames.frames.n).toBeGreaterThan(30);
		expect(report.frames.frames.median).toBeGreaterThan(0);

		// The renderer must have issued draws; if this is empty the hooks are not
		// attached and every "no GL cost" conclusion drawn from them is worthless.
		const draws = report.gl.find((g) => g.name === 'drawElements');
		expect(draws?.calls ?? 0).toBeGreaterThan(0);

		for (const spike of report.frames.spikes)
			expect(spike.dt).toBeGreaterThanOrEqual(50);
	});

	test('tracks per-bone local rotation on the player rig', async ({
		page,
	}) => {
		await enterDungeon(page);
		await page.evaluate(() => {
			window.__profiler.start({ gl: false });
			window.__profiler.watchPose(['spine_01', 'hand_r', 'head'], {
				near: window.__coll?.pos,
			});
		});
		await page.waitForTimeout(4000);
		const report = await page.evaluate(() => window.__profiler.stop());

		const spine = report.pose.find((p) => p.name === 'spine_01');
		expect(spine, 'spine_01 not found on the rig').toBeTruthy();
		expect(spine!.degrees.n).toBeGreaterThan(30);

		// Regression guard for the compounding procedural pass: a bone the mixer
		// has stopped driving gains the same angle every frame, so median and p99
		// converge on one value instead of spreading across a range.
		for (const bone of report.pose) {
			if (bone.degrees.n < 30) continue;
			const constant =
				bone.degrees.median > 0.5 &&
				Math.abs(bone.degrees.p99 - bone.degrees.median) < 0.01;
			expect(
				constant,
				`${bone.name} rotates a constant ${bone.degrees.median} deg/frame — a procedural pass is compounding onto it`,
			).toBe(false);
		}
	});
});
