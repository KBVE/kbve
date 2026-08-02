import { test, expect, type Page } from '@playwright/test';

interface MeshInfo {
	slot: string;
	named: boolean;
	visible: boolean;
}

const ARMOR_SLOTS = ['TORS', 'HIPS', 'LEGL', 'LEGR', 'ABAC', 'AHED', 'HNDL'];
const SKIN_SLOTS = ['SKIN_TORS', 'SKIN_HIPS', 'SKIN_LEGL', 'SKIN_LEGR'];

// Known-harmless noise from three + the headless pointer-lock rejection.
const IGNORED = [
	'THREE.Clock',
	'deprecated parameters for the initialization function',
	'not valid for pointer lock',
	'toNonIndexed',
];

async function enterDungeon(page: Page): Promise<MeshInfo[]> {
	await page.goto('/', { waitUntil: 'load' });
	await page.getByText('Play', { exact: true }).click({ timeout: 60_000 });
	await page.waitForFunction(
		() =>
			typeof (window as unknown as { __coll?: { meshes?: unknown } })
				.__coll?.meshes === 'function',
		undefined,
		{ timeout: 90_000 },
	);
	return page.evaluate(() =>
		(
			window as unknown as { __coll: { meshes: () => MeshInfo[] } }
		).__coll.meshes(),
	);
}

test.describe('production rig', () => {
	test('every character mesh keeps its slot name', async ({ page }) => {
		const meshes = await enterDungeon(page);
		expect(meshes.length).toBeGreaterThan(0);
		expect(meshes.filter((m) => !m.slot)).toEqual([]);
	});

	test('no mesh falls back to a GLTFLoader-generated name', async ({
		page,
	}) => {
		const meshes = await enterDungeon(page);
		// three names unnamed meshes 'mesh_N'. Any of those left in the
		// resolved slots means a real slot name went missing in the artifact.
		expect(meshes.filter((m) => /^mesh_\d+$/.test(m.slot))).toEqual([]);
	});

	test('player spawns naked: armor hidden, skin shown', async ({ page }) => {
		const meshes = await enterDungeon(page);
		const bySlot = new Map(meshes.map((m) => [m.slot, m.visible]));

		// Presence first — a missing slot yields undefined, and an
		// `=== true` filter would then pass on the very build this guards.
		const unresolved = [...ARMOR_SLOTS, ...SKIN_SLOTS].filter(
			(s) => !bySlot.has(s),
		);
		expect(unresolved).toEqual([]);

		expect(ARMOR_SLOTS.map((s) => bySlot.get(s))).toEqual(
			ARMOR_SLOTS.map(() => false),
		);
		expect(SKIN_SLOTS.map((s) => bySlot.get(s))).toEqual(
			SKIN_SLOTS.map(() => true),
		);
	});

	test('no shader or runtime errors on spawn', async ({ page }) => {
		const bad: string[] = [];
		page.on('console', (m) => {
			if (m.type() !== 'error') return;
			if (IGNORED.some((i) => m.text().includes(i))) return;
			bad.push(m.text());
		});
		page.on('pageerror', (e) => {
			if (IGNORED.some((i) => e.message.includes(i))) return;
			bad.push(e.message);
		});
		await enterDungeon(page);
		expect(bad).toEqual([]);
	});
});
