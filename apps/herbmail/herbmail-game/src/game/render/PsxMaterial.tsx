import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend, type ThreeElement } from '@react-three/fiber';
import { HEIGHT_HELPERS, POM_MARCH, SPOM_SILHOUETTE } from '@kbve/laser';
import { FOG, TILE } from '../config';

const blankTex = new THREE.DataTexture(
	new Uint8Array(1),
	1,
	1,
	THREE.RedFormat,
);
blankTex.needsUpdate = true;

export const MAX_LIGHTS = 24;
export const LIGHT_RANGE = 13.5;

const vertex = /* glsl */ `
	uniform float uSnap;
	uniform vec2 uRes;
	varying vec2 vUvCorrect;
	varying vec2 vUvAffine;
	varying float vW;
	varying vec3 vWorld;
	varying vec3 vNormal;
	varying vec3 vPomView;

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
			vNormal = mat3(modelMatrix) * normal;

		vec3 Nw = normalize(vNormal);
		vec3 up = abs(Nw.y) > 0.999 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
		vec3 Tw = normalize(cross(up, Nw));
		vec3 Bw = cross(Nw, Tw);
		vPomView = (cameraPosition - vWorld) * mat3(Tw, Bw, Nw);

		gl_Position = pos;
	}
`;

const fragment = /* glsl */ `
	#define MAX_LIGHTS ${MAX_LIGHTS}
	#define LIGHT_RANGE ${LIGHT_RANGE.toFixed(1)}
	#define OCC_STEPS 34
	#define GRID_TILE ${TILE.toFixed(1)}
	uniform sampler2D uMap;
	uniform sampler2D uMapTex;
	uniform vec2 uGridOrigin;
	uniform vec2 uGridSize;
	uniform vec3 uTint;
	uniform vec3 uFogColor;
	uniform float uFogNear;
	uniform float uFogFar;
	uniform float uAffine;
	uniform float uAmbient;
	uniform float uPom;
	uniform float uPomScale;
	uniform float uPomMin;
	uniform float uPomMax;
	uniform float uSilhouette;
		uniform float uOcclude;
	uniform int uLightCount;
	uniform vec3 uLightPos[MAX_LIGHTS];
	uniform vec3 uLightColor[MAX_LIGHTS];
	varying vec2 vUvCorrect;
	varying vec2 vUvAffine;
	varying float vW;
	varying vec3 vWorld;
	varying vec3 vNormal;
	varying vec3 vPomView;

	${HEIGHT_HELPERS}

	float pomSampleDepth(vec2 uv) {
		return pomDepthFromLuma(uMap, uv);
	}

	${POM_MARCH}
	${SPOM_SILHOUETTE}

	float tileAtWorld(vec2 p) {
		vec2 local = (p - uGridOrigin) / GRID_TILE;
		float col = floor(local.x);
		float row = floor(local.y);
		if (col < 0.0 || row < 0.0 || col >= uGridSize.x || row >= uGridSize.y) return 0.0;
		vec2 uvp = (vec2(col, row) + 0.5) / uGridSize;
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
		vec2 uv;
		if (uPom > 0.5) {
			// Distance-LOD: fade relief to flat as fog swallows the surface.
			float lod = 1.0 - clamp((vW - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
			float hitDepth;
			// POM runs on perspective-correct UV — affine warp would swim.
			uv = pomMarch(
				vUvCorrect, vPomView,
				uPomScale * lod, uPomMin, mix(uPomMin, uPomMax, lod),
				hitDepth
			);
			if (uSilhouette > 0.5 && pomSilhouetteClip(uv, vec4(0.0, 0.0, 1.0, 1.0))) discard;
		} else {
			uv = mix(vUvCorrect, vUvAffine / vW, uAffine);
		}
		vec4 tex = texture2D(uMap, uv);

		vec3 light = vec3(uAmbient);
		vec3 N = normalize(vNormal);
		if (!gl_FrontFacing) N = -N;
		for (int i = 0; i < MAX_LIGHTS; i++) {
			if (i >= uLightCount) break;
			vec3 toL = uLightPos[i] - vWorld;
			float d = length(toL);
			float win = clamp(1.0 - pow(d / LIGHT_RANGE, 4.0), 0.0, 1.0);
			if (win <= 0.0) continue;
			vec3 L = toL / max(d, 0.001);
			float ndl = dot(N, L);
			float lambert = max(ndl * 0.75 + 0.25, 0.0);
			lambert *= lambert;
			float att = 1.0 / max(0.4 + 0.15 * d + 0.12 * d * d, 0.05);
			float vis = uOcclude > 0.5 ? visibility(vWorld.xz, uLightPos[i].xz) : 1.0;
			light += uLightColor[i] * att * win * win * vis * lambert;
		}

		vec3 lit = tex.rgb * uTint * light;
		float fog = clamp((vW - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
		vec3 rgb = mix(lit, uFogColor, fog);
		gl_FragColor = vec4(rgb, tex.a);
	}
`;

const PsxMaterialBase = shaderMaterial(
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
		uPom: 0,
		uPomScale: 0.06,
		uPomMin: 6,
		uPomMax: 24,
		uSilhouette: 0,
		uOcclude: 1,
		uMapTex: blankTex,
		uGridOrigin: new THREE.Vector2(0, 0),
		uGridSize: new THREE.Vector2(1, 1),
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

// Live PSX materials register on construct, unregister on dispose. LightSystem
// iterates this set to push light/occlusion uniforms — far cheaper than walking the
// whole scene graph (thousands of chunk meshes) every frame to find them.
export const psxMaterialRegistry = new Set<THREE.ShaderMaterial>();

class PsxMaterialImpl extends PsxMaterialBase {
	constructor() {
		super();
		psxMaterialRegistry.add(this);
	}
	dispose(): void {
		psxMaterialRegistry.delete(this);
		super.dispose();
	}
}

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
