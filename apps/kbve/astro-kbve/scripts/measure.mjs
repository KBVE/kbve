// Layout probe for the built astro-kbve site.
//
// Usage:
//   1. Build:  ./kbve.sh -nx astro-kbve:build --skip-nx-cache
//   2. Serve:  (cd dist/apps/astro-kbve && python3 -m http.server 8199)
//   3. Probe:  node apps/kbve/astro-kbve/scripts/measure.mjs <path> [selector ...]
//
// Reports, per viewport (desktop + mobile): cumulative layout shift,
// horizontal overflow (document width vs viewport), the height of any
// selectors you pass, and the first few console errors.
//
// Env: BASE (default http://localhost:8199), WAIT ms (default 3000).

import { chromium } from 'playwright';

const path = process.argv[2] ?? '/';
const selectors = process.argv.slice(3);
const BASE = process.env.BASE ?? 'http://localhost:8199';
const WAIT = Number(process.env.WAIT ?? 3000);
const url = `${BASE.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

const VIEWPORTS = [
	[1280, 900, 'desktop'],
	[412, 915, 'mobile'],
];

const browser = await chromium.launch();
try {
	for (const [w, h, name] of VIEWPORTS) {
		const ctx = await browser.newContext({ viewport: { width: w, height: h } });
		await ctx.addInitScript(() => {
			window.__cls = 0;
			new PerformanceObserver((l) => {
				for (const e of l.getEntries())
					if (!e.hadRecentInput) window.__cls += e.value;
			}).observe({ type: 'layout-shift', buffered: true });
		});
		const page = await ctx.newPage();
		const errors = [];
		page.on('console', (m) => {
			if (m.type() === 'error') errors.push(m.text().slice(0, 120));
		});
		await page.goto(url, { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(WAIT);

		const data = await page.evaluate((sels) => {
			const vw = document.documentElement.clientWidth;
			const docW = document.documentElement.scrollWidth;
			const heights = {};
			for (const s of sels) {
				const el = document.querySelector(s);
				heights[s] = el
					? Math.round(el.getBoundingClientRect().height)
					: null;
			}
			return { vw, docW, overflow: docW - vw, heights };
		}, selectors);
		const cls = await page.evaluate(() => window.__cls);

		console.log(
			`[${name}] CLS ${cls.toFixed(4)}  overflow ${data.overflow}px` +
				(selectors.length
					? '  heights ' + JSON.stringify(data.heights)
					: '') +
				(errors.length
					? '\n  errors ' + JSON.stringify(errors.slice(0, 3))
					: ''),
		);
		await ctx.close();
	}
} finally {
	await browser.close();
}
