import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend, type ThreeElement } from '@react-three/fiber';

const vertex = /* glsl */ `
	uniform float uSnap;
	varying vec2 vUvCorrect;
	varying vec2 vUvAffine;
	varying float vW;

	void main() {
		vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

		// PSX vertex snapping: quantize in normalized device space
		vec3 ndc = pos.xyz / pos.w;
		vec2 grid = vec2(uSnap);
		ndc.xy = floor(ndc.xy * grid) / grid;
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
		uAffine: 0.3,
		uTint: new THREE.Color(1, 1, 1),
		uFogColor: new THREE.Color('#0a0a0e'),
		uFogNear: 3,
		uFogFar: 15,
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
