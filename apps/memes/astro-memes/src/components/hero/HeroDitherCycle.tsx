import { useEffect } from 'react';

/**
 * Unsplash photo IDs to cycle through.
 * Add/remove IDs here to change the hero image rotation.
 */
const UNSPLASH_IDS = [
	'1443890923422-7819ed4101c0',
	'1706076463257-20b41d9519f0',
	'1716045168176-15d310a01dc0',
	'1600758208050-a22f17dc5bb9',
];

function unsplashUrl(id: string, w = 1400): string {
	return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;
}

/**
 * Bayer 8×8 ordered dither matrix, normalized to [0, 1).
 * Each value is a threshold — during the dissolve, pixels whose
 * threshold is below the current progress show the incoming image.
 */
const BAYER_8 = [
	[0, 32, 8, 40, 2, 34, 10, 42],
	[48, 16, 56, 24, 50, 18, 58, 26],
	[12, 44, 4, 36, 14, 46, 6, 38],
	[60, 28, 52, 20, 62, 30, 54, 22],
	[3, 35, 11, 43, 1, 33, 9, 41],
	[51, 19, 59, 27, 49, 17, 57, 25],
	[15, 47, 7, 39, 13, 45, 5, 37],
	[63, 31, 55, 23, 61, 29, 53, 21],
].map((row) => row.map((v) => v / 64));

/** Downscale factor — canvas renders at 1/SCALE for pixel dither aesthetic */
const SCALE = 4;
/** Milliseconds between image transitions */
const CYCLE_MS = 8000;
/** Milliseconds for the dither dissolve animation */
const DISSOLVE_MS = 2000;

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
}

/** Draw image to canvas with cover-fit (background-size: cover equivalent) */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
	const cw = ctx.canvas.width;
	const ch = ctx.canvas.height;
	const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
	const sw = cw / scale;
	const sh = ch / scale;
	ctx.drawImage(
		img,
		(img.naturalWidth - sw) / 2,
		(img.naturalHeight - sh) / 2,
		sw,
		sh,
		0,
		0,
		cw,
		ch,
	);
}

function easeInOut(t: number): number {
	return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/**
 * Minimal hydration island — renders nothing to the VDOM (O(1)).
 * Attaches to the static #hero and #hero-canvas elements to:
 *   1. Cycle background images with a Bayer ordered-dither dissolve
 *   2. Fade the hero section on scroll
 */
export default function HeroDitherCycle() {
	useEffect(() => {
		const hero = document.getElementById('hero');
		const canvas = document.getElementById(
			'hero-canvas',
		) as HTMLCanvasElement | null;
		if (!hero || !canvas) return;

		const ctx = canvas.getContext('2d', { alpha: false });
		if (!ctx) return;

		let disposed = false;
		let rafId = 0;
		let cycleTimer: ReturnType<typeof setTimeout>;
		let currentIdx = 0;
		let currentImg: HTMLImageElement | null = null;
		const imageCache = new Map<string, HTMLImageElement>();

		function resize() {
			canvas!.width = Math.ceil(hero!.offsetWidth / SCALE);
			canvas!.height = Math.ceil(hero!.offsetHeight / SCALE);
		}

		async function getImage(idx: number): Promise<HTMLImageElement> {
			const id = UNSPLASH_IDS[idx];
			let img = imageCache.get(id);
			if (!img) {
				img = await loadImage(unsplashUrl(id));
				imageCache.set(id, img);
			}
			return img;
		}

		function preload(idx: number) {
			const id = UNSPLASH_IDS[idx];
			if (!imageCache.has(id)) {
				loadImage(unsplashUrl(id))
					.then((img) => imageCache.set(id, img))
					.catch(() => {});
			}
		}

		// ── Initialization ───────────────────────────────
		async function init() {
			resize();
			try {
				currentImg = await getImage(0);
				if (disposed) return;
				drawCover(ctx!, currentImg);
				// Canvas is ready — show it and hide CSS background
				canvas!.style.display = 'block';
				hero!.style.backgroundImage = 'none';
			} catch {
				return; // CSS background-image remains as fallback
			}
			// Preload remaining images
			for (let i = 1; i < UNSPLASH_IDS.length; i++) preload(i);
			scheduleCycle();
		}

		// ── Cycle timer ──────────────────────────────────
		function scheduleCycle() {
			if (disposed || UNSPLASH_IDS.length < 2) return;
			cycleTimer = setTimeout(() => runTransition(), CYCLE_MS);
		}

		// ── Dither dissolve transition ───────────────────
		async function runTransition() {
			if (disposed) return;
			const nextIdx = (currentIdx + 1) % UNSPLASH_IDS.length;
			const w = canvas!.width;
			const h = canvas!.height;

			// Snapshot current pixels (clone the buffer)
			const dataA = new Uint32Array(
				ctx!.getImageData(0, 0, w, h).data.buffer.slice(0),
			);

			// Get next image
			let nextImg: HTMLImageElement;
			try {
				nextImg = await getImage(nextIdx);
			} catch {
				currentIdx = nextIdx;
				scheduleCycle();
				return;
			}
			if (disposed) return;

			// Draw next image and snapshot its pixels
			drawCover(ctx!, nextImg);
			const dataB = new Uint32Array(
				ctx!.getImageData(0, 0, w, h).data.buffer.slice(0),
			);

			// Prepare output buffer
			const outData = ctx!.createImageData(w, h);
			const out32 = new Uint32Array(outData.data.buffer);
			const t0 = performance.now();

			function animate(now: number) {
				if (disposed) return;
				const raw = Math.min(1, (now - t0) / DISSOLVE_MS);
				const progress = easeInOut(raw);

				// Bayer ordered-dither blend
				for (let i = 0, len = out32.length; i < len; i++) {
					const threshold = BAYER_8[((i / w) | 0) & 7][i % w & 7];
					out32[i] = progress > threshold ? dataB[i] : dataA[i];
				}
				ctx!.putImageData(outData, 0, 0);

				if (raw < 1) {
					rafId = requestAnimationFrame(animate);
				} else {
					currentIdx = nextIdx;
					currentImg = nextImg;
					preload((nextIdx + 1) % UNSPLASH_IDS.length);
					scheduleCycle();
				}
			}

			rafId = requestAnimationFrame(animate);
		}

		init();

		// ── Scroll fade ──────────────────────────────────
		let ticking = false;
		const onScroll = () => {
			if (ticking) return;
			ticking = true;
			requestAnimationFrame(() => {
				const ratio = Math.max(
					0,
					1 - window.scrollY / hero!.offsetHeight,
				);
				hero!.style.opacity = String(ratio);
				ticking = false;
			});
		};
		window.addEventListener('scroll', onScroll, { passive: true });

		// ── Resize ───────────────────────────────────────
		const onResize = () => {
			resize();
			if (currentImg) drawCover(ctx!, currentImg);
		};
		window.addEventListener('resize', onResize);

		return () => {
			disposed = true;
			cancelAnimationFrame(rafId);
			clearTimeout(cycleTimer);
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
		};
	}, []);

	return null;
}
