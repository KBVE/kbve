import { test, expect, type Page } from '@playwright/test';

declare global {
	interface Window {
		__vm: {
			scene: {
				matrixWorldAutoUpdate: boolean;
				traverse(cb: (o: Record<string, unknown>) => void): void;
			};
		};
		__coll?: { pos: unknown };
		__mtx?: { frames: number; visits: number };
	}
}

async function enterDungeon(page: Page): Promise<void> {
	await page.goto('/', { waitUntil: 'load' });
	await page.getByText('Play', { exact: true }).click({ timeout: 60_000 });
	await page.waitForFunction(
		() => typeof window.__coll?.pos === 'object',
		undefined,
		{ timeout: 90_000 },
	);
	await page.waitForTimeout(4000);
}

test.describe('world matrix updates', () => {
	// Three passes render this scene each frame and WebGLRenderer.render rebuilds
	// every world matrix before each one. AOComposer opts the scene out and drives
	// a single update per frame instead. Nothing looks wrong when this regresses —
	// the frame just costs ~1ms more — so it needs an explicit guard.
	test('the graph is walked once per frame, not once per pass', async ({
		page,
	}) => {
		await enterDungeon(page);

		const objects = await page.evaluate(() => {
			let n = 0;
			window.__vm.scene.traverse(() => n++);
			return n;
		});
		expect(objects).toBeGreaterThan(500);

		await page.evaluate(() => {
			const scene = window.__vm.scene;
			let mesh: Record<string, unknown> | null = null;
			scene.traverse((o) => {
				if (!mesh && o.isMesh) mesh = o;
			});
			let p = Object.getPrototypeOf(mesh);
			while (
				p &&
				!Object.prototype.hasOwnProperty.call(p, 'updateMatrixWorld')
			)
				p = Object.getPrototypeOf(p);

			const s = { frames: 0, visits: 0 };
			window.__mtx = s;
			const orig = p.updateMatrixWorld;
			p.updateMatrixWorld = function (this: unknown, force?: boolean) {
				s.visits++;
				return orig.call(this, force);
			};
			const tick = () => {
				s.frames++;
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		});

		await page.waitForTimeout(4000);

		const { frames, visits } = await page.evaluate(() => ({
			frames: window.__mtx!.frames,
			visits: window.__mtx!.visits,
		}));
		expect(frames).toBeGreaterThan(30);

		// Sector streaming and R3F mounts add visits on top of the render walk, so
		// the bar is well clear of 1x while still failing loudly at the 3x this
		// replaced.
		const walksPerFrame = visits / frames / objects;
		expect(walksPerFrame).toBeLessThan(2);
	});

	test('the scene opts out of per-render matrix updates', async ({
		page,
	}) => {
		await enterDungeon(page);
		expect(
			await page.evaluate(() => window.__vm.scene.matrixWorldAutoUpdate),
		).toBe(false);
	});

	// Static room chunks sit at identity under a group that never moves; both are
	// frozen. A frozen mesh that is never marked dirty would render at the world
	// origin, so this also covers markWorld still running on mount.
	test('room chunks are frozen and still placed correctly', async ({
		page,
	}) => {
		await enterDungeon(page);
		const out = await page.evaluate(() => {
			let chunks = 0,
				frozen = 0,
				detached = 0;
			const rooms = new Set<string>();
			window.__vm.scene.traverse((o) => {
				const kind = (o.userData as { kind?: string } | undefined)
					?.kind;
				if (!o.isMesh || kind !== 'wall') return;
				chunks++;
				if (!o.matrixAutoUpdate) frozen++;
				const e = (o.matrixWorld as { elements: number[] }).elements;
				// The chunk's own matrix is identity, so a correctly propagated
				// world matrix is exactly the parent's. A chunk that never got
				// marked dirty keeps an identity world matrix and detaches from
				// its room — invisible at the origin room, obvious anywhere else.
				const p = (o.parent as { matrixWorld: { elements: number[] } })
					.matrixWorld.elements;
				if (
					Math.hypot(e[12] - p[12], e[13] - p[13], e[14] - p[14]) >
					1e-6
				)
					detached++;
				rooms.add(
					`${e[12].toFixed(2)},${e[13].toFixed(2)},${e[14].toFixed(2)}`,
				);
			});
			return { chunks, frozen, detached, rooms: rooms.size };
		});
		expect(out.chunks).toBeGreaterThan(20);
		expect(out.frozen).toBe(out.chunks);
		expect(out.detached).toBe(0);
		// More than one distinct room origin proves propagation actually ran:
		// every chunk collapsing to one point is the failure this guards.
		expect(out.rooms).toBeGreaterThan(1);
	});
});
