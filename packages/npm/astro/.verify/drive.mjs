// Browser-drive the SiteGraph harness: hover-dim, restore, pan, wheel-zoom,
// console errors. Run the vite server first, then this driver:
//   npx vite --config .verify/vite.config.mjs    # from packages/npm/astro
//   node .verify/drive.mjs
import { chromium } from 'playwright';

const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + '\n');
const URL = process.env.URL ?? 'http://localhost:4330/';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 700 } });
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.sg-node', { timeout: 10000 });
await page.waitForTimeout(1500); // let the sim settle so node positions exist

const nodeCount = await page.locator('.sg-node').count();

const styleOf = (id, sel) =>
	page.evaluate(
		({ id, sel }) => {
			const g = document.querySelector(`.sg-node[data-id="${id}"]`);
			if (!g) return null;
			if (sel === 'opacity') return g.style.opacity;
			const el = g.querySelector(sel);
			return el ? el.getAttribute('fill') : null;
		},
		{ id, sel },
	);
const linkOpacity = (s, t) =>
	page.evaluate(
		({ s, t }) => {
			const p = document.querySelector(
				`.sg-link[data-source="${s}"][data-target="${t}"]`,
			);
			return p ? p.getAttribute('stroke-opacity') : null;
		},
		{ s, t },
	);
const groupTransform = () =>
	page.evaluate(
		() =>
			document.querySelector('.sg-link')?.closest('g')?.getAttribute('transform') ??
			null,
	);

await page.screenshot({ path: '.verify/shot-base.png' });

// Hover node 'b' (neighbors: a). 'd' is non-adjacent → should dim.
await page.locator('.sg-node[data-id="b"]').hover({ force: true });
await page.waitForTimeout(150);
const hover = {
	bFill: await styleOf('b', '.sg-node-circle'),
	dOpacity_nonAdjacent: await styleOf('d', 'opacity'),
	aOpacity_adjacent: await styleOf('a', 'opacity'),
	linkAB: await linkOpacity('a', 'b'),
	linkAD_dimmed: await linkOpacity('a', 'd'),
};
await page.screenshot({ path: '.verify/shot-hover.png' });

// Leave → base restored.
await page.mouse.move(5, 5);
await page.waitForTimeout(150);
const afterLeave = {
	bFill: await styleOf('b', '.sg-node-circle'),
	dOpacity: await styleOf('d', 'opacity'),
	linkAD: await linkOpacity('a', 'd'),
};

// Pan drag on empty SVG space.
const svg = await page.locator('svg').first().boundingBox();
const before = await groupTransform();
const sx = svg.x + svg.width / 2;
const sy = svg.y + svg.height - 18;
await page.mouse.move(sx, sy);
await page.mouse.down();
await page.mouse.move(sx + 60, sy - 50, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(80);
const afterPan = await groupTransform();

// Wheel zoom over the center.
await page.mouse.move(svg.x + svg.width / 2, svg.y + svg.height / 2);
await page.mouse.wheel(0, -240);
await page.waitForTimeout(120);
const afterWheel = await groupTransform();

out({
	nodeCount,
	hover,
	afterLeave,
	pan: { before, afterPan, panned: before !== afterPan },
	wheel: { afterWheel, zoomed: afterPan !== afterWheel },
	consoleErrors,
});

await browser.close();
