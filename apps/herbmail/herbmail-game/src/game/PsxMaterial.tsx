import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend, type ThreeElement } from '@react-three/fiber';
import { FOG, TILE } from './config';
import { COLS, ROWS, mapTexture } from './level';

export const MAX_LIGHTS = 24;
export const LIGHT_RANGE = 10;

const vertex = /* glsl */ `
	uniform float uSnap;
	uniform vec2 uRes;
	varying vec2 vUvCorrect;
	varying vec2 vUvAffine;
	varying float vW;
	varying vec3 vWorld;

	void main() {
		vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

		// PSX vertex snapping: aspect-correct grid, round for steadiness
		vec3 ndc = pos.xyz / pos.w;
		float aspect = uRes.x / max(uRes.y, 1.0);
		vec2 grid = vec2(uSnap * aspect, uSnap);
		ndc.xy = floor(ndc.xy * grid + 0.5) / grid;
		pos.xyz = ndc * pos.w;

		// perspective-correct (standard varying) vs affine (pre-multiplied by w)
		vUvCorrect = uv;
		vUvAffine = uv * pos.w;
		vW = pos.w;
		vWorld = (modelMatrix * vec4(position, 1.0)).xyz;

		gl_Position = pos;
	}
`;

const fragment = /* glsl */ `
	#define MAX_LIGHTS ${MAX_LIGHTS}
	#define LIGHT_RANGE ${LIGHT_RANGE.toFixed(1)}
	#define OCC_STEPS 34
	#define GRID_COLS ${COLS.toFixed(1)}
	#define GRID_ROWS ${ROWS.toFixed(1)}
	#define GRID_TILE ${TILE.toFixed(1)}
	uniform sampler2D uMap;
	uniform sampler2D uMapTex;
	uniform vec3 uTint;
	uniform vec3 uFogColor;
	uniform float uFogNear;
	uniform float uFogFar;
	uniform float uAffine;
	uniform float uAmbient;
	uniform int uLightCount;
	uniform vec3 uLightPos[MAX_LIGHTS];
	uniform vec3 uLightColor[MAX_LIGHTS];
	varying vec2 vUvCorrect;
	varying vec2 vUvAffine;
	varying float vW;
	varying vec3 vWorld;

	float tileAtWorld(vec2 p) {
		float col = floor(p.x / GRID_TILE);
		float row = floor(p.y / GRID_TILE);
		vec2 uvp = (vec2(col, row) + 0.5) / vec2(GRID_COLS, GRID_ROWS);
		return texture2D(uMapTex, uvp).r;
	}

	float visibility(vec2 frag, vec2 lp) {
		vec2 d = lp - frag;
		float len = length(d);
		if (len < 0.6) return 1.0;
		vec2 dir = d / len;
		float end = len - 0.45;
		for (int k = 0; k < OCC_STEPS; k++) {
			float s = 0.5 + float(k) * 0.32;
			if (s >= end) break;
			if (tileAtWorld(frag + dir * s) > 0.75) return 0.0;
		}
		return 1.0;
	}

	void main() {
		vec2 uv = mix(vUvCorrect, vUvAffine / vW, uAffine);
		vec4 tex = texture2D(uMap, uv);

		vec3 light = vec3(uAmbient);
		for (int i = 0; i < MAX_LIGHTS; i++) {
			if (i >= uLightCount) break;
			float d = distance(vWorld, uLightPos[i]);
			float win = clamp(1.0 - pow(d / LIGHT_RANGE, 4.0), 0.0, 1.0);
			if (win <= 0.0) continue;
			float att = 1.0 / max(0.5 * d + 0.5 * d * d, 0.05);
			float vis = visibility(vWorld.xz, uLightPos[i].xz);
			light += uLightColor[i] * att * win * win * vis;
		}

		vec3 lit = tex.rgb * uTint * light;
		float fog = clamp((vW - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
		vec3 rgb = mix(lit, uFogColor, fog);
		gl_FragColor = vec4(rgb, tex.a);
	}
`;

const PsxMaterialImpl = shaderMaterial(
	{
		uMap: null as THREE.Texture | null,
		uSnap: 80,
		uRes: new THREE.Vector2(1, 1),
		uAffine: 0.3,
		uTint: new THREE.Color(1, 1, 1),
		uFogColor: new THREE.Color(FOG.color),
		uFogNear: FOG.near,
		uFogFar: FOG.far,
		uAmbient: 0.12,
		uMapTex: mapTexture(),
		uLightCount: 0,
		uLightPos: Array.from(
			{ length: MAX_LIGHTS },
			() => new THREE.Vector3(),
		),
		uLightColor: Array.from(
			{ length: MAX_LIGHTS },
			() => new THREE.Vector3(),
		),
	},
	vertex,
	fragment,
);

extend({ PsxMaterial: PsxMaterialImpl });

export type PsxMaterialType = THREE.ShaderMaterial & {
	uMap: THREE.Texture | null;
	uSnap: number;
	uTint: THREE.Color;
};

declare module '@react-three/fiber' {
	interface ThreeElements {
		psxMaterial: ThreeElement<typeof PsxMaterialImpl>;
	}
}
