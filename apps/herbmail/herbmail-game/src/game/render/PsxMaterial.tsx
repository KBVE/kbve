import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend, type ThreeElement } from '@react-three/fiber';
import {
	HEIGHT_HELPERS,
	POM_MARCH,
	POM_SELF_SHADOW,
	SPOM_SILHOUETTE,
} from '@kbve/laser';
import { TILE } from '../config';

const blankTex = new THREE.DataTexture(
	new Uint8Array(1),
	1,
	1,
	THREE.RedFormat,
);
blankTex.needsUpdate = true;

export const MAX_LIGHTS = 24;
export const LIGHT_RANGE = 13.5;
// POM relief LOD band. Darkness comes from light attenuation, so relief detail
// past the torch glow is invisible — full strength inside RELIEF_NEAR, faded
// to flat by RELIEF_FAR (just past LIGHT_RANGE where surfaces read black).
export const RELIEF_NEAR = 6;
export const RELIEF_FAR = 16;

const vertex = /* glsl */ `
	uniform float uSnap;
	uniform vec2 uRes;
	varying vec2 vUvCorrect;
	varying vec2 vUvAffine;
	varying float vW;
	varying vec3 vWorld;
	varying vec3 vNormal;
	varying vec3 vPomView;
	varying vec3 vTangent;
	varying vec3 vBitangent;

	void main() {
		vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

		// PSX vertex snapping: aspect-correct grid, round for steadiness.
		// uSnap <= 0 disables it entirely (modern mode).
		if (uSnap > 0.5) {
			vec3 ndc = pos.xyz / pos.w;
			float aspect = uRes.x / max(uRes.y, 1.0);
			vec2 grid = vec2(uSnap * aspect, uSnap);
			ndc.xy = floor(ndc.xy * grid + 0.5) / grid;
			pos.xyz = ndc * pos.w;
		}

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
		vTangent = Tw;
		vBitangent = Bw;

		gl_Position = pos;
	}
`;

const fragment = /* glsl */ `
	#define MAX_LIGHTS ${MAX_LIGHTS}
	#define LIGHT_RANGE ${LIGHT_RANGE.toFixed(1)}
	#define OCC_STEPS 34
	#define GRID_TILE ${TILE.toFixed(1)}
	uniform sampler2D uMap;
	uniform sampler2D uNormalMap;
	uniform sampler2D uHarMap;
	uniform float uUseMaps;
	uniform sampler2D uMapTex;
	uniform vec2 uGridOrigin;
	uniform vec2 uGridSize;
	uniform vec3 uTint;
	uniform float uReliefNear;
	uniform float uReliefFar;
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
	varying vec3 vTangent;
	varying vec3 vBitangent;

	${HEIGHT_HELPERS}

	float pomSampleDepth(vec2 uv) {
		if (uUseMaps > 0.5) return 1.0 - texture2D(uHarMap, uv).r;
		return pomDepthFromLuma(uMap, uv);
	}

	${POM_MARCH}
	${SPOM_SILHOUETTE}
	${POM_SELF_SHADOW}

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
		float pomLod = 0.0;
		float pomHit = 0.0;
		if (uPom > 0.5) {
			// Distance-LOD: fade relief to flat past the torch glow; those
			// surfaces are attenuation-black, so marching them is wasted work.
			pomLod = 1.0 - clamp((vW - uReliefNear) / (uReliefFar - uReliefNear), 0.0, 1.0);
			if (pomLod <= 0.0) {
				uv = vUvCorrect;
			} else {
			float hitDepth;
			// POM runs on perspective-correct UV — affine warp would swim.
			uv = pomMarch(
				vUvCorrect, vPomView,
				uPomScale * pomLod, uPomMin, mix(uPomMin, uPomMax, pomLod),
				hitDepth
			);
			pomHit = hitDepth;
			if (uSilhouette > 0.5 && pomSilhouetteClip(uv, vec4(0.0, 0.0, 1.0, 1.0))) discard;
			}
		} else {
			uv = mix(vUvCorrect, vUvAffine / vW, uAffine);
		}
		vec4 tex = texture2D(uMap, uv);

		vec3 N = normalize(vNormal);
		if (!gl_FrontFacing) N = -N;
		float ao = 1.0;
		float rough = 1.0;
		if (uUseMaps > 0.5) {
			vec3 nTex = texture2D(uNormalMap, uv).rgb * 2.0 - 1.0;
			N = normalize(mat3(normalize(vTangent), normalize(vBitangent), N) * nTex);
			vec3 har = texture2D(uHarMap, uv).rgb;
			ao = har.g;
			rough = har.b;
		}
		vec3 light = vec3(uAmbient * ao);
		vec3 Veye = normalize(cameraPosition - vWorld);
		float shin = mix(96.0, 8.0, rough);
		float specGain = (1.0 - rough) * 0.6;
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
			float spec = 0.0;
			if (specGain > 0.0 && ndl > 0.0) {
				vec3 H = normalize(L + Veye);
				spec = pow(max(dot(N, H), 0.0), shin) * specGain;
			}
			float base = att * win * win * (lambert + spec);
			// Occlusion march (up to 34 map taps) only pays off when the light
			// still contributes visibly; sub-threshold lights skip it.
			if (base < 0.004) continue;
			float vis = uOcclude > 0.5 ? visibility(vWorld.xz, uLightPos[i].xz) : 1.0;
			// Relief self-shadow from the nearest light only (lights arrive
			// sorted by distance): bricks shade their own mortar.
			if (i == 0 && uPom > 0.5 && uUseMaps > 0.5 && pomLod > 0.0) {
				vec3 lTS = toL * mat3(
					normalize(vTangent),
					normalize(vBitangent),
					normalize(vNormal)
				);
				float selfSh = pomSelfShadow(uv, pomHit, lTS, uPomScale * pomLod, 8.0);
				vis *= mix(1.0, selfSh, pomLod);
			}
			light += uLightColor[i] * base * vis;
		}

		// No distance fog — darkness comes from light attenuation alone
		// (everything beyond LIGHT_RANGE falls to black on its own).
		vec3 rgb = tex.rgb * uTint * light;
		// Output linear: the AO composer's OutputPass applies the single sRGB
		// encode, round-tripping back to the tuned display values.
		gl_FragColor = vec4(pow(rgb, vec3(2.2)), tex.a);
	}
`;

const PsxMaterialBase = shaderMaterial(
	{
		uMap: null as THREE.Texture | null,
		uNormalMap: blankTex as THREE.Texture,
		uHarMap: blankTex as THREE.Texture,
		uUseMaps: 0,
		uSnap: 80,
		uRes: new THREE.Vector2(1, 1),
		uAffine: 0.3,
		uTint: new THREE.Color(1, 1, 1),
		uReliefNear: RELIEF_NEAR,
		uReliefFar: RELIEF_FAR,
		uAmbient: 0.12,
		uPom: 0,
		uPomScale: 0.06,
		uPomMin: 6,
		uPomMax: 12,
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

export class PsxMaterialImpl extends PsxMaterialBase {
	constructor() {
		super();
		psxMaterialRegistry.add(this);
	}
	// Re-register on every draw: StrictMode's mount→unmount→remount replay
	// disposes the material (unregistering it) and reattaches the SAME
	// instance without re-running the constructor, which left live walls
	// permanently unlit. Set.add is idempotent, so this is a cheap no-op on
	// the happy path.
	onBeforeRender(): void {
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
