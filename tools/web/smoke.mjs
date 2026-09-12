#!/usr/bin/env node
// Loads a built web-game bundle in a real browser and fails on anything the
// console reports. This is the check that `moon run <game>:build-web` cannot
// do: a wasm bundle links and instantiates perfectly while panicking on the
// first frame that touches an unsupported platform API, which is how
// kbve-mmorpg@0.1.0 shipped a build that drew terrain and never spawned a
// player (#17220).
//
//   node tools/web/smoke.mjs <dist-dir> [seconds]
//
// Serves <dist-dir> through serve-coi.mjs so the headers match what itch
// sends, which is what makes SharedArrayBuffer available here too.

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = process.argv[2] ?? 'dist';
const seconds = Number(process.argv[3] ?? 45);

const note = (m) => console.log(`::notice::${m}`);
const warn = (m) => console.log(`::warning::${m}`);
const fail = (m) => console.log(`::error::${m}`);

// A 404 for `<asset>.meta` is bevy asking whether an asset has a settings
// sidecar. Almost none do, so this is the normal path, not a fault.
const isMetaProbe = (text) => /\.meta\b/.test(text);

async function freePort() {
	return new Promise((resolve, reject) => {
		const srv = createServer();
		srv.on('error', reject);
		srv.listen(0, '127.0.0.1', () => {
			const { port } = srv.address();
			srv.close(() => resolve(port));
		});
	});
}

async function waitForServer(url, timeoutMs = 30_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url);
			if (res.ok) return;
		} catch {
			// not listening yet
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`server never answered at ${url}`);
}

// Playwright's own chromium reports a null WebGPU adapter when headless, so
// the branded channel is what makes this runnable without a display. Both
// GitHub's ubuntu images and a normal workstation have it.
async function launch(chromium) {
	const args = ['--enable-unsafe-swiftshader'];
	try {
		return await chromium.launch({ channel: 'chrome', headless: true, args });
	} catch {
		warn('no Chrome channel; falling back to the bundled chromium');
		return await chromium.launch({ headless: true, args });
	}
}

const port = await freePort();
const server = spawn(process.execPath, [path.join(here, 'serve-coi.mjs'), dist, String(port)], {
	stdio: ['ignore', 'pipe', 'pipe'],
});

let exitCode = 0;
let browser;
try {
	const url = `http://127.0.0.1:${port}/index.html`;
	await waitForServer(url);

	const { chromium } = await import('@playwright/test');
	browser = await launch(chromium);
	const page = await browser.newPage();

	const errors = [];
	page.on('console', (m) => {
		if (m.type() !== 'error') return;
		// Chrome logs a failed request twice: here without the URL, and through
		// the response handler with it. Keep the one that says which file.
		if (/Failed to load resource/.test(m.text())) return;
		errors.push(m.text());
	});
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('response', (r) => {
		if (r.status() >= 400 && !isMetaProbe(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`);
	});

	await page.goto(url, { waitUntil: 'load', timeout: 120_000 });

	const isolated = await page.evaluate(() => globalThis.crossOriginIsolated === true);
	if (!isolated) {
		fail('the page is not cross-origin isolated; SharedArrayBuffer is unavailable');
		exitCode = 1;
	} else {
		note('cross-origin isolated, SharedArrayBuffer available');
	}

	const adapter = await page.evaluate(async () => Boolean(await navigator.gpu?.requestAdapter()));
	if (!adapter) {
		// Everything below needs a renderer. Saying so beats reporting the
		// resulting "Unable to find a GPU" panic as if the bundle were broken.
		warn('no WebGPU adapter in this browser; skipping the render checks');
		process.exit(exitCode);
	}

	await page.waitForTimeout(seconds * 1000);

	// bevy resizes the canvas off its 300x150 default once it owns a surface,
	// so a canvas still at the default means the app never got that far.
	const canvas = await page.evaluate(() => {
		const c = document.querySelector('canvas');
		return c ? { w: c.width, h: c.height } : null;
	});
	if (!canvas || (canvas.w === 300 && canvas.h === 150)) {
		fail(`the canvas never took a real size (${canvas ? `${canvas.w}x${canvas.h}` : 'absent'})`);
		exitCode = 1;
	} else {
		note(`rendering at ${canvas.w}x${canvas.h}`);
	}

	if (errors.length) {
		fail(`${errors.length} console error(s) in ${seconds}s`);
		for (const e of errors.slice(0, 20)) console.log(`  ${e.split('\n')[0]}`);
		exitCode = 1;
	} else {
		note(`no console errors in ${seconds}s`);
	}
} catch (err) {
	fail(err.message);
	exitCode = 1;
} finally {
	await browser?.close();
	server.kill();
}

process.exit(exitCode);
