import Phaser from 'phaser';
import { BIOMES, biomeTextureKey } from '../config';

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
uniform vec4 uWorldView;
uniform vec2 uAtlas;
uniform float uRegionFreq;
uniform float uEdgeFreq;
uniform float uEdgeJitter;
uniform float uBlendWidth;

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

void main() {
	vec2 ws = vec2(
		uWorldView.x + outTexCoord.x * uWorldView.z,
		uWorldView.y + (1.0 - outTexCoord.y) * uWorldView.w
	);

	float a = ws.x / 32.0;
	float b = ws.y / 16.0;
	vec2 tile = vec2((a + b) * 0.5, (b - a) * 0.5);

	float ux = ws.x;
	float uy = ws.y * 2.0;
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
	resize(width: number, height: number): void;
}

export function makeGroundShader(scene: Phaser.Scene): GroundShaderHandle {
	const cam = scene.cameras.main;
	const textures = BIOMES.map((b) => biomeTextureKey(b));
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
				setUniform('uWorldView', [wv.x, wv.y, wv.width, wv.height]);
				setUniform('uAtlas', [ATLAS_W, ATLAS_H]);
				setUniform('uRegionFreq', REGION_FREQ);
				setUniform('uEdgeFreq', EDGE_FREQ);
				setUniform('uEdgeJitter', EDGE_JITTER);
				setUniform('uBlendWidth', BLEND_WIDTH);
			},
		},
		cam.width / 2,
		cam.height / 2,
		cam.width,
		cam.height,
		textures,
	);
	shader.setScrollFactor(0);
	shader.setDepth(0);

	return {
		shader,
		resize(width: number, height: number) {
			shader.setPosition(width / 2, height / 2);
			shader.setSize(width, height);
		},
	};
}
