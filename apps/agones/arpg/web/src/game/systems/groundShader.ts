import Phaser from 'phaser';
import { BIOMES, biomeTextureKey } from '../config';
import { isoHeightActive } from '../iso';
import type { HeightTextureHandle } from './heightTexture';

const ATLAS_W = 1024;
const ATLAS_H = 512;
const REGION_FREQ = 0.11;
const EDGE_FREQ = 0.6;
const EDGE_JITTER = 1.1;
const BLEND_WIDTH = 0.16;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 outTexCoord;

uniform sampler2D uBiome0;
uniform sampler2D uBiome1;
uniform sampler2D uBiome2;
uniform sampler2D uBiome3;
uniform sampler2D uHeight;
uniform vec4 uWorldView;
uniform vec2 uAtlas;
uniform float uRegionFreq;
uniform float uEdgeFreq;
uniform float uEdgeJitter;
uniform float uBlendWidth;
uniform vec4 uHeightRect;
uniform float uHeightAmpPx;
uniform float uHeightOn;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec2 flatTile(vec2 ws) {
	float a = ws.x / 32.0;
	float b = ws.y / 16.0;
	return vec2((a + b) * 0.5, (b - a) * 0.5);
}

float liftPx(vec2 tile) {
	vec2 huv = (tile - uHeightRect.xy) * uHeightRect.zw;
	if (huv.x < 0.0 || huv.x > 1.0 || huv.y < 0.0 || huv.y > 1.0) return 0.0;
	vec4 s = texture2D(uHeight, huv);
	float hn = (s.r * 65280.0 + s.g * 255.0) / 65535.0;
	return (hn * 2.0 - 1.0) * uHeightAmpPx;
}

void main() {
	vec2 ws = vec2(
		uWorldView.x + outTexCoord.x * uWorldView.z,
		uWorldView.y + (1.0 - outTexCoord.y) * uWorldView.w
	);

	vec2 tile = flatTile(ws);
	if (uHeightOn > 0.5) {
		float hi = uHeightAmpPx;
		float lo = hi;
		bool found = false;
		for (int i = 0; i < 40; i++) {
			lo = hi - 16.0;
			if (lo < -uHeightAmpPx - 16.0) { break; }
			vec2 t = flatTile(vec2(ws.x, ws.y + lo));
			if (liftPx(t) - lo >= 0.0) { found = true; break; }
			hi = lo;
		}
		if (found) {
			for (int i = 0; i < 10; i++) {
				float mid = (lo + hi) * 0.5;
				vec2 t = flatTile(vec2(ws.x, ws.y + mid));
				if (liftPx(t) - mid > 0.0) { lo = mid; } else { hi = mid; }
			}
			tile = flatTile(vec2(ws.x, ws.y + (lo + hi) * 0.5));
		}
	}

	vec2 wsFlat = vec2((tile.x - tile.y) * 32.0, (tile.x + tile.y) * 16.0);
	float ux = wsFlat.x;
	float uy = wsFlat.y * 2.0;
	vec2 uv = vec2(ux + uy, uy - ux) * 0.70710678 / uAtlas;

	vec4 t0 = texture2D(uBiome0, uv);
	vec4 t1 = texture2D(uBiome1, uv);
	vec4 t2 = texture2D(uBiome2, uv);
	vec4 t3 = texture2D(uBiome3, uv);

	float f = vnoise(tile * uRegionFreq);
	float jitter = (vnoise(tile * uEdgeFreq + 17.0) - 0.5) * uEdgeJitter;
	float bf = clamp(f * 4.0 + jitter, 0.0, 3.9999);
	float i0 = floor(bf);
	float w = smoothstep(0.5 - uBlendWidth, 0.5 + uBlendWidth, fract(bf));

	vec4 lo = i0 < 0.5 ? t0 : (i0 < 1.5 ? t1 : (i0 < 2.5 ? t2 : t3));
	vec4 hi = i0 < 0.5 ? t1 : (i0 < 1.5 ? t2 : t3);

	gl_FragColor = vec4(mix(lo, hi, w).rgb, 1.0);
}
`;

export interface GroundShaderHandle {
	shader: Phaser.GameObjects.Shader;
	update(
		cam: Phaser.Cameras.Scene2D.Camera,
		heightTex?: HeightTextureHandle,
	): void;
}

export function makeGroundShader(scene: Phaser.Scene): GroundShaderHandle {
	const cam = scene.cameras.main;
	const biomeKeys = BIOMES.map((b) => biomeTextureKey(b));
	const textures = biomeKeys;
	const heightState = {
		rect: [0, 0, 1, 1] as [number, number, number, number],
		ampPx: 0,
		on: 0,
	};
	let boundHeightKey = '';
	const shader = scene.add.shader(
		{
			name: 'arpg-ground',
			fragmentSource: FRAG,
			setupUniforms: (
				setUniform: (name: string, value: number | number[]) => void,
			) => {
				const wv = scene.cameras.main.worldView;
				setUniform('uBiome0', 0);
				setUniform('uBiome1', 1);
				setUniform('uBiome2', 2);
				setUniform('uBiome3', 3);
				setUniform('uHeight', 4);
				setUniform('uWorldView', [wv.x, wv.y, wv.width, wv.height]);
				setUniform('uAtlas', [ATLAS_W, ATLAS_H]);
				setUniform('uRegionFreq', REGION_FREQ);
				setUniform('uEdgeFreq', EDGE_FREQ);
				setUniform('uEdgeJitter', EDGE_JITTER);
				setUniform('uBlendWidth', BLEND_WIDTH);
				setUniform('uHeightRect', heightState.rect);
				setUniform('uHeightAmpPx', heightState.ampPx);
				setUniform('uHeightOn', heightState.on);
			},
		},
		cam.width / 2,
		cam.height / 2,
		cam.width,
		cam.height,
		textures,
	);
	shader.setScrollFactor(0);
	shader.setOrigin(0.5);
	shader.setDepth(0);

	// Screen-pinned quad: the camera zoom still scales it, so counter-scale by
	// 1/zoom each frame -> it renders exactly viewport-sized at any zoom, and
	// uWorldView (which already encodes zoom) maps outTexCoord 0..1 to the viewport.
	return {
		shader,
		update(
			cam: Phaser.Cameras.Scene2D.Camera,
			heightTex?: HeightTextureHandle,
		) {
			shader.setSize(cam.width, cam.height);
			shader.setPosition(cam.width / 2, cam.height / 2);
			shader.setScale(1 / cam.zoom);

			if (heightTex && heightTex.key && isoHeightActive()) {
				heightState.rect = heightTex.rect;
				heightState.ampPx = heightTex.ampPx;
				heightState.on = 1;
				if (boundHeightKey !== heightTex.key) {
					boundHeightKey = heightTex.key;
					shader.setTextures([...biomeKeys, heightTex.key]);
				}
			} else {
				heightState.on = 0;
			}
		},
	};
}
