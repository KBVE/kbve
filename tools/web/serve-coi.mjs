#!/usr/bin/env node
// Serves a built web game with the two headers a SharedArrayBuffer needs.
//
// `npx serve` and every other static server in reach sends neither, so a
// bundle built with shared memory loads, reports `crossOriginIsolated ===
// false`, and fails when something asks for a SharedArrayBuffer -- which reads
// as a wasm bug rather than as two missing response headers. itch.io sets the
// same pair for a game with "SharedArrayBuffer support" switched on, so this is
// the local shape of the thing the bundle will be served by.
//
// Started as isometric's scripts/serve-coi.mjs. It is here because mmorpg needs
// the same server and a second copy would be a second set of MIME types to
// forget to update.
//
// Usage: node tools/web/serve-coi.mjs [root] [port]   (default: ./dist, 8787)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? process.env.WEB_ROOT ?? 'dist');
const port = Number(process.argv[3] ?? process.env.PORT ?? 8787);

// Served rather than guessed: a wasm module handed back as
// application/octet-stream fails instantiateStreaming, and a .glb as text
// fails in the gltf loader several seconds later, where it looks like a broken
// asset.
const MIME = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.wasm': 'application/wasm',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
	'.ktx2': 'image/ktx2',
	'.ico': 'image/x-icon',
	'.ttf': 'font/ttf',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.glb': 'model/gltf-binary',
	'.gltf': 'model/gltf+json',
	'.wgsl': 'text/plain; charset=utf-8',
	'.glsl': 'text/plain; charset=utf-8',
	'.ron': 'text/plain; charset=utf-8',
};

function coiHeaders(res) {
	res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
	res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
	res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

async function resolveFile(urlPath) {
	const clean = decodeURIComponent(urlPath.split('?')[0]);
	const rel = normalize(clean).replace(/^(\.\.[/\\])+/, '');
	let target = join(root, rel);
	if (!target.startsWith(root)) return null;
	try {
		const info = await stat(target);
		if (info.isDirectory()) target = join(target, 'index.html');
	} catch {
		return null;
	}
	try {
		return { target, body: await readFile(target) };
	} catch {
		return null;
	}
}

const server = createServer(async (req, res) => {
	coiHeaders(res);
	const hit = await resolveFile(req.url ?? '/');
	if (!hit) {
		// Only a navigation gets index.html. Falling back for everything meant
		// a missing file answered 200 with a page of HTML, and bevy's asset
		// server -- which probes for a `<asset>.meta` beside every asset and
		// expects a 404 when there is none -- parsed that HTML as RON and
		// logged "Failed to deserialize meta" for every texture and shader in
		// the game. itch answers 404 there, so the bundle was fine and only
		// the local server lied about it.
		const wantsHtml = (req.headers.accept ?? '').includes('text/html');
		const fallback = wantsHtml ? await resolveFile('/index.html') : null;
		if (fallback) {
			res.writeHead(200, { 'Content-Type': MIME['.html'] });
			res.end(fallback.body);
			return;
		}
		res.writeHead(404, { 'Content-Type': 'text/plain' });
		res.end('not found');
		return;
	}
	const type = MIME[extname(hit.target).toLowerCase()] ?? 'application/octet-stream';
	res.writeHead(200, { 'Content-Type': type });
	res.end(hit.body);
});

server.listen(port, () => {
	console.log(`COI server: http://localhost:${port}/  (root: ${root})`);
});
