import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend, type ThreeElement } from '@react-three/fiber';
import {
	HEIGHT_HELPERS,
	POM_MARCH,
	POM_SELF_SHADOW,
	SPOM_SILHOUETTE,
} from '@kbve/laser/r3f';
import { LIGHT_RANGE, TILE } from '../config';
import { NEAR_D0, NEAR_D1 } from './bake/bakeTypes';
import { MAX_CAPS } from './charShadow';
import { OCC_CELLS, OCC_NEAR, OCC_REACH } from './occMarch';

const blankTex = new THREE.DataTexture(
	new Uint8Array(1),
	1,
	1,
	THREE.RedFormat,
);
blankTex.needsUpdate = true;

export const MAX_LIGHTS = 8;
export { LIGHT_RANGE };
// POM relief LOD band. Darkness comes from light attenuation, so relief detail
// past the torch glow is invisible — full strength inside RELIEF_NEAR, faded
// to flat by RELIEF_FAR (just past LIGHT_RANGE where surfaces read black).
export const RELIEF_NEAR = 16;
export const RELIEF_FAR = 22;

const vertex = /* glsl */ `
	uniform float uSnap;
	uniform vec2 uRes;
	// Static torch light integrated per-vertex at sector build time. Absent on
	// geometry that never bakes (doors, props), where WebGL supplies 0.
	attribute vec3 aBake;
	varying vec3 vBake;
	varying vec2 vUvCorrect;
	varying vec2 vUvAffine;
	varying float vW;
	varying vec3 vWorld;
	varying vec3 vNormal;
	varying vec3 vPomView;
	varying vec3 vTangent;
	varying vec3 vBitangent;

	void main() {
		vBake = aBake;
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
	#define NEAR_D0 ${NEAR_D0.toFixed(1)}
	#define NEAR_D1 ${NEAR_D1.toFixed(1)}
	// Where the occluder march starts and stops, in world units. These are the
	// bounds of the fixed 0.32-step loop the cell walk replaced (its first and
	// last sample, 0.5 and 0.5 + 33*0.32) and are kept verbatim so lighting reach
	// is unchanged — LIGHT_RANGE is 18, so the far third of a distant light's ray
	// was never tested for occluders and still is not.
	#define OCC_NEAR ${OCC_NEAR.toFixed(2)}
	#define OCC_REACH ${OCC_REACH.toFixed(2)}
	// Cells a ray can enter over OCC_REACH: at most ceil(span/GRID_TILE) on each
	// axis plus one, with headroom for the diagonal case.
	#define OCC_CELLS ${OCC_CELLS}
	#define OCC_FAR 1e9
	#define MAX_CAPS ${MAX_CAPS}
	// Only the nearest lights throw character shadows. A third torch's copy of
	// the same body reads as mush and costs another N capsule tests.
	#define CAP_LIGHTS 2
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
	// 1 = this emitter's far field is already baked into aBake, so the loop
	// contributes only its near field. 0 = fully dynamic (held torch, props,
	// fireflies, or a sector whose bake hasn't landed yet).
	uniform float uLightNear[MAX_LIGHTS];
	uniform vec3 uSunDir;
	uniform vec3 uSunColor;
	uniform vec3 uSkyAmbient;
	uniform float uBakeFlicker;
	uniform float uLightGain;
	uniform float uBakeGain;
	uniform vec4 uAtt;
	// Character capsules: xyz + radius, with height in uCapH. Tested against the
	// light ray for the nearest few lights only — cheap directional shadows with
	// no shadow map. See charShadow.ts.
	uniform int uCapCount;
	uniform vec4 uCaps[MAX_CAPS];
	uniform float uCapH[MAX_CAPS];
	uniform float uCapStrength;
	varying vec3 vBake;
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

	// Occluder lookup by grid cell rather than by world point: the march below
	// walks cells directly, so it already knows which one it is in and has no
	// reason to re-derive it from a position.
	float tileAtCell(vec2 c) {
		if (c.x < 0.0 || c.y < 0.0 || c.x >= uGridSize.x || c.y >= uGridSize.y) return 0.0;
		return texture2D(uMapTex, (c + 0.5) / uGridSize).r;
	}

	// Open-sky exposure (G channel of the tile grid): 1 inside an oasis room, 0
	// under a closed ceiling. The 3x3 neighbourhood max that keeps oasis walls
	// (which sit on the boundary tile) from going dark is baked into the channel
	// when the grid is built — see dilateSky in dungeon/occlusion.ts. It only
	// changes when the active room set does, and cost 9 texture fetches here on
	// every lit fragment of every wall, floor and ceiling.
	float skyAtWorld(vec2 p) {
		vec2 local = (p - uGridOrigin) / GRID_TILE;
		float col = floor(local.x);
		float row = floor(local.y);
		if (col < 0.0 || row < 0.0 || col >= uGridSize.x || row >= uGridSize.y) return 0.0;
		vec2 uvp = (vec2(col, row) + 0.5) / uGridSize;
		return texture2D(uMapTex, uvp).g;
	}

	// Shortest distance between the fragment->light segment and a character's
	// vertical axis segment. Standard segment/segment closest-approach, with the
	// capsule axis kept vertical so the setup collapses to a couple of dots.
	float capsuleShade(vec3 frag, vec3 lightPos, vec4 cap, float h) {
		vec3 d1 = lightPos - frag;
		vec3 a = cap.xyz;
		vec3 d2 = vec3(0.0, h, 0.0);
		vec3 r = frag - a;

		float A = dot(d1, d1);
		float e = dot(d2, d2);
		float f = dot(d2, r);
		if (A < 1e-5 || e < 1e-5) return 1.0;
		float b = dot(d1, d2);
		float c = dot(d1, r);
		float denom = A * e - b * b;

		float s = denom > 1e-5 ? clamp((b * f - c * e) / denom, 0.0, 1.0) : 0.0;
		float t = clamp((b * s + f) / e, 0.0, 1.0);
		s = clamp((b * t - c) / A, 0.0, 1.0);

		// Only occlude between the surface and the light, never behind either.
		if (s <= 0.001 || s >= 0.999) return 1.0;

		vec3 p1 = frag + d1 * s;
		vec3 p2 = a + d2 * t;
		float dist = length(p1 - p2);

		// Soft edge, but tight: a wide penumbra on a vertical capsule wraps the
		// shadow all the way around the feet instead of casting it away from
		// the light, which reads as a curved smear rather than a body.
		float soft = smoothstep(cap.w, cap.w * 1.3, dist);
		// Fade with distance from the caster so a body far down a corridor stops
		// painting a crisp shadow across the whole room.
		float reach = 1.0 - smoothstep(6.0, 13.0, length(frag - a));
		return mix(1.0, soft, uCapStrength * reach);
	}

	float charShadow(vec3 frag, vec3 lightPos) {
		float v = 1.0;
		for (int c = 0; c < MAX_CAPS; c++) {
			if (c >= uCapCount) break;
			v *= capsuleShade(frag, lightPos, uCaps[c], uCapH[c]);
		}
		return v;
	}

	// The tile grid is piecewise constant over GRID_TILE-sized cells, so the old
	// fixed 0.32-unit march resampled the same cell about nine times before
	// crossing into the next: up to 34 texture fetches per light per fragment to
	// read at most four distinct cells. This walks cell boundaries instead
	// (Amanatides-Woo), touching each cell the ray actually enters exactly once.
	//
	// Reach stays capped at what the fixed march covered — OCC_REACH, its last
	// sample — so lights further away keep their unshadowed far field rather
	// than suddenly picking up walls the old loop never reached.
	//
	// Not a pure speedup: a fixed step could stride over a cell the ray only
	// clips, and this cannot, so corners that used to leak light now occlude.
	// The set of cells tested is a superset of the old one, never a subset, so
	// the change only ever adds shadow.
	float visibility(vec2 frag, vec2 lp) {
		vec2 d = lp - frag;
		float len = length(d);
		if (len < 0.6) return 1.0;
		vec2 dir = d / len;
		float travel = min(len - 0.45, OCC_REACH) - OCC_NEAR;
		if (travel <= 0.0) return 1.0;

		vec2 g = (frag + dir * OCC_NEAR - uGridOrigin) / GRID_TILE;
		vec2 gd = dir / GRID_TILE;
		vec2 cell = floor(g);
		vec2 stp = sign(gd);
		// An axis the ray does not move along never crosses a boundary; a huge
		// tDelta keeps it from ever winning the min() below.
		vec2 tDelta = vec2(
			gd.x != 0.0 ? abs(1.0 / gd.x) : OCC_FAR,
			gd.y != 0.0 ? abs(1.0 / gd.y) : OCC_FAR
		);
		vec2 tMax = vec2(
			gd.x > 0.0 ? (cell.x + 1.0 - g.x) / gd.x
				: (gd.x < 0.0 ? (cell.x - g.x) / gd.x : OCC_FAR),
			gd.y > 0.0 ? (cell.y + 1.0 - g.y) / gd.y
				: (gd.y < 0.0 ? (cell.y - g.y) / gd.y : OCC_FAR)
		);

		for (int k = 0; k < OCC_CELLS; k++) {
			if (tileAtCell(cell) > 0.75) return 0.0;
			if (min(tMax.x, tMax.y) >= travel) break;
			if (tMax.x < tMax.y) {
				cell.x += stp.x;
				tMax.x += tDelta.x;
			} else {
				cell.y += stp.y;
				tMax.y += tDelta.y;
			}
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
			nTex.xy *= 1.7;
			N = normalize(mat3(normalize(vTangent), normalize(vBitangent), N) * nTex);
			vec3 har = texture2D(uHarMap, uv).rgb;
			ao = har.g;
			rough = har.b;
		}
		// Baked static torchlight (far field only — see NEAR_D0/NEAR_D1). Not
		// multiplied by ao: the dynamic loop doesn't either, and doing so
		// double-darkens every baked surface. Global flicker keeps baked pools
		// breathing instead of reading as a painted-on lightmap.
		vec3 light =
			vec3(uAmbient * ao) +
			vBake * uBakeFlicker * uBakeGain * uLightGain;
		vec3 Veye = normalize(cameraPosition - vWorld);
		// Firelight is diffuse: a soft broad lobe and weak gain, or torch light
		// reads as a flashlight glare ring on the bricks.
		float shin = mix(32.0, 6.0, rough);
		float specGain = (1.0 - rough) * 0.28;
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
			// Cap the near-field so a light half a meter from a wall paints a
			// warm pool instead of a blown-out hotspot (the flashlight look).
			float att = min(
				1.0 / max(uAtt.x + uAtt.y * d + uAtt.z * d * d, 0.05),
				uAtt.w
			);
			float spec = 0.0;
			if (specGain > 0.0 && ndl > 0.0) {
				vec3 H = normalize(L + Veye);
				spec = pow(max(dot(N, H), 0.0), shin) * specGain;
			}
			// Complement of the bake's farWeight: near 1 close in, 0 past
			// NEAR_D1 where the baked far field has taken over.
			float ft = clamp((d - NEAR_D0) / (NEAR_D1 - NEAR_D0), 0.0, 1.0);
			float nearW = mix(1.0, 1.0 - ft * ft * (3.0 - 2.0 * ft), uLightNear[i]);
			float base = att * win * win * (lambert + spec) * nearW;
			// Occlusion march (up to 34 map taps) only pays off when the light
			// still contributes visibly; sub-threshold lights skip it.
			if (base < 0.004) continue;
			float vis = uOcclude > 0.5 ? visibility(vWorld.xz, uLightPos[i].xz) : 1.0;
			// Character shadows ride the same visibility term, so they respect
			// the light's own falloff and cost nothing when the light is already
			// occluded by geometry.
			// Walls only. On the floor the capsule degenerates into a ring around
			// the feet (every nearby fragment's light ray grazes the capsule
			// base), so the ground shadow is left to the shaped blob, which
			// actually carries a silhouette.
			if (uCapCount > 0 && i < CAP_LIGHTS && vis > 0.0 && abs(N.y) < 0.5)
				vis *= charShadow(vWorld, uLightPos[i]);
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
			light += uLightColor[i] * base * vis * uLightGain;
		}

		// Open-sky rooms (oasis) take a sky-ambient fill plus a directional sun/
		// moon term, both masked by open-sky exposure so the closed dungeon is
		// byte-for-byte unchanged.
		float sky = skyAtWorld(vWorld.xz);
		if (sky > 0.0) {
			light += uSkyAmbient * sky;
			light += uSunColor * max(dot(N, uSunDir), 0.0) * sky;
		}

		// Break tiling repetition without touching UV continuity: two octaves of
		// low-frequency world-space value noise darken the albedo in patches
		// (reads as damp/soot/wear), so identical brick tiles stop reading as a
		// grid at distance. Near-free next to the POM march.
		float m1 = fract(sin(dot(floor(vWorld.xz * 0.55), vec2(12.9898, 78.233))) * 43758.5453);
		float m2 = fract(sin(dot(floor(vWorld.xz * 1.7 + 9.1), vec2(39.3468, 11.135))) * 24634.6345);
		float macro = mix(0.68, 1.0, m1) * mix(0.82, 1.0, m2);
		// No distance fog — darkness comes from light attenuation alone
		// (everything beyond LIGHT_RANGE falls to black on its own).
		vec3 rgb = tex.rgb * uTint * light * macro;
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
		uAmbient: 0.2,
		uPom: 0,
		uPomScale: 0.14,
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
		uLightNear: Array.from({ length: MAX_LIGHTS }, () => 0),
		uSunDir: new THREE.Vector3(0.35, 0.85, 0.4).normalize(),
		uSunColor: new THREE.Vector3(0.85, 0.78, 0.6),
		uSkyAmbient: new THREE.Vector3(0.6, 0.66, 0.8),
		uBakeFlicker: 1,
		uLightGain: 1,
		uBakeGain: 1,
		uAtt: new THREE.Vector4(0.35, 0.09, 0.02, 1.6),
		uCapCount: 0,
		uCaps: Array.from({ length: MAX_CAPS }, () => new THREE.Vector4()),
		uCapH: Array.from({ length: MAX_CAPS }, () => 0),
		uCapStrength: 0.75,
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
