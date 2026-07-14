#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const grassDir = resolve(
	repoRoot,
	'apps/agones/arpg/web/public/assets/arcade/arpg/textures/grass',
);
const outDir = process.env.OUT ? resolve(process.cwd(), process.env.OUT) : grassDir;

const ATLAS_W = 1024;
const ATLAS_H = 512;
const TILE_W = 256;
const TILE_H = 128;
const PATCHES = 72;
const MIN_W = 120;
const MAX_W = 280;
const QUALITY = 84;

const BIOMES = {
	meadow: { base: '03', tiles: ['01', '03', '13', '18'] },
	spring: { base: '09', tiles: ['09', '05', '06', '17'] },
	forest: { base: '14', tiles: ['14', '04', '16', '08'] },
	wetland: { base: '15', tiles: ['15', '12', '13', '17'] },
};

function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function variantPath(num, side) {
	return resolve(grassDir, `grass_${num}_${side}.png`);
}

function pickTilePath(num, rand) {
	const side = rand() < 0.5 ? 'l' : 'r';
	const p = variantPath(num, side);
	return existsSync(p) ? p : variantPath(num, 'l');
}

function featherMask(w, h) {
	const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fff" stop-opacity="0.42"/><stop offset="45%" stop-color="#fff" stop-opacity="0.34"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="url(#g)"/></svg>`;
	return Buffer.from(svg);
}

async function tiledBase(num) {
	const tile = await sharp(variantPath(num, 'l'))
		.resize(TILE_W, TILE_H)
		.toBuffer();
	return sharp({
		create: {
			width: ATLAS_W,
			height: ATLAS_H,
			channels: 4,
			background: { r: 0, g: 0, b: 0, alpha: 1 },
		},
	})
		.composite([{ input: tile, tile: true, blend: 'over' }])
		.png()
		.toBuffer();
}

async function buildBiome(name, cfg, seed) {
	const rand = rng(seed);
	let canvas = await tiledBase(cfg.base);
	for (let i = 0; i < PATCHES; i++) {
		const num = cfg.tiles[(rand() * cfg.tiles.length) | 0];
		const w = (MIN_W + rand() * (MAX_W - MIN_W)) | 0;
		const h = (w * (0.5 + rand() * 0.35)) | 0;
		const src = pickTilePath(num, rand);
		const patch = await sharp(src)
			.resize(w, h)
			.composite([{ input: featherMask(w, h), blend: 'dest-in' }])
			.png()
			.toBuffer();
		const left = (rand() * (ATLAS_W - w)) | 0;
		const top = (rand() * (ATLAS_H - h)) | 0;
		canvas = await sharp(canvas)
			.composite([{ input: patch, left, top, blend: 'over' }])
			.png()
			.toBuffer();
	}
	const out = resolve(outDir, `biome_${name}.webp`);
	await sharp(canvas).webp({ quality: QUALITY }).toFile(out);
	console.log(`biome_${name}.webp  <- base ${cfg.base} + ${PATCHES} patches`);
}

let seed = 0x9e3779b9;
for (const [name, cfg] of Object.entries(BIOMES)) {
	await buildBiome(name, cfg, seed);
	seed = (seed + 0x85ebca6b) >>> 0;
}
