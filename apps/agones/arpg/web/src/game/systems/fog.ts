import Phaser from 'phaser';
import {
	DEPTH_UI,
	FOG_ZOOM_OUT,
	FOG_ZOOM_IN,
	FOG_MAX_STRENGTH,
} from '../config';

export interface FogState {
	image?: Phaser.GameObjects.Image;
	vignette?: Phaser.Filters.Vignette;
}

export function makeFogState(): FogState {
	return {};
}

/**
 * Distance fog. On WebGL it uses Phaser 4's built-in per-pixel Vignette camera
 * filter (GPU, the right hook for richer fog / fog-of-war later). On the canvas
 * renderer (no filters) it falls back to a radial vignette image locked to the
 * camera. Either way: clear around the player, fogged toward the streaming
 * boundary instead of a hard void cliff. The fog only matters when zoomed OUT
 * (the void edge is visible); zoomed in it fades away via syncFogToZoom().
 */
export function buildFog(scene: Phaser.Scene, st: FogState): void {
	if (scene.renderer.type === Phaser.WEBGL) {
		st.vignette = scene.cameras.main.filters.internal.addVignette(
			0.5,
			0.5,
			0.62,
			0,
			0x05070d,
		);
		syncFogToZoom(scene, st);
		return;
	}
	buildFogVignette(scene, st);
}

/** Canvas-renderer fallback: a radial gradient vignette over the viewport. */
function buildFogVignette(scene: Phaser.Scene, st: FogState): void {
	const key = 'arpg-fog-radial';
	if (!scene.textures.exists(key)) {
		const size = 512;
		const tex = scene.textures.createCanvas(key, size, size);
		const ctx = tex!.getContext();
		const r = size / 2;
		const grad = ctx.createRadialGradient(r, r, r * 0.42, r, r, r);
		grad.addColorStop(0, 'rgba(8,9,14,0)');
		grad.addColorStop(0.7, 'rgba(8,9,14,0.55)');
		grad.addColorStop(1, 'rgba(8,9,14,1)');
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, size, size);
		tex!.refresh();
	}

	st.image = scene.add
		.image(0, 0, key)
		.setOrigin(0.5, 0.5)
		.setScrollFactor(0)
		.setDepth(DEPTH_UI - 1);
	sizeFog(scene, st);
	scene.scale.on(Phaser.Scale.Events.RESIZE, () => sizeFog(scene, st));
}

/** Stretch the fog vignette to blanket the whole viewport, centred. */
function sizeFog(scene: Phaser.Scene, st: FogState): void {
	if (!st.image) return;
	const cam = scene.cameras.main;
	const w = cam.width;
	const h = cam.height;
	const span = Math.hypot(w, h) * 1.15;
	st.image.setPosition(w / 2, h / 2);
	st.image.setDisplaySize(span, span);
}

/**
 * Fog only matters when zoomed OUT, where the streamed void boundary comes into
 * view; zoomed in the screen is tight and fog just dims the scene. Map zoom ->
 * fog strength: full at FOG_ZOOM_OUT, fading to none by FOG_ZOOM_IN. The canvas
 * fallback image's alpha rides the same curve.
 */
export function syncFogToZoom(scene: Phaser.Scene, st: FogState): void {
	const zoom = scene.cameras.main.zoom;
	const t = Phaser.Math.Clamp(
		(FOG_ZOOM_IN - zoom) / (FOG_ZOOM_IN - FOG_ZOOM_OUT),
		0,
		1,
	);
	const strength = t * FOG_MAX_STRENGTH;
	if (st.vignette) st.vignette.strength = strength;
	if (st.image) st.image.setAlpha(t);
}
