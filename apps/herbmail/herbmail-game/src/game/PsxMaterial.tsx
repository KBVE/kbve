import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend, type ThreeElement } from '@react-three/fiber';
import { FOG } from './config';

const vertex = /* glsl */ `
	uniform float uSnap;
	uniform vec2 uRes;
	varying vec2 vUvCorrect;
	varying vec2 vUvAffine;
	varying float vW;

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

		gl_Position = pos;
	}
`;

const fragment = /* glsl */ `
	uniform sampler2D uMap;
	uniform vec3 uTint;
	uniform vec3 uFogColor;
	uniform float uFogNear;
	uniform float uFogFar;
	uniform float uAffine;
	varying vec2 vUvCorrect;
	varying vec2 vUvAffine;
	varying float vW;

	void main() {
		vec2 uv = mix(vUvCorrect, vUvAffine / vW, uAffine);
		vec4 tex = texture2D(uMap, uv);
		float fog = clamp((vW - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
		vec3 rgb = mix(tex.rgb * uTint, uFogColor, fog);
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
