import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '..', 'dist');
const port = Number(process.env.PORT ?? 8787);

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
	'.ico': 'image/x-icon',
	'.ttf': 'font/ttf',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.wgsl': 'text/plain; charset=utf-8',
	'.glsl': 'text/plain; charset=utf-8',
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
		const body = await readFile(target);
		return { target, body };
	} catch {
		return null;
	}
}

const server = createServer(async (req, res) => {
	coiHeaders(res);
	const hit = await resolveFile(req.url ?? '/');
	if (!hit) {
		const fallback = await resolveFile('/index.html');
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
	console.log(`isometric COI server: http://localhost:${port}/  (root: ${root})`);
});
