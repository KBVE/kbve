import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform float uSeed;
uniform float uSpeed;

uniform vec3 uCore;
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uEdge;
uniform vec3 uGlow;

float hash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float noise21(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash21(i);
	float b = hash21(i + vec2(1.0, 0.0));
	float c = hash21(i + vec2(0.0, 1.0));
	float d = hash21(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
	float value = 0.0;
	float amplitude = 0.5;
	for (int i = 0; i < 4; i++) {
		value += noise21(p) * amplitude;
		p = p * 2.03 + vec2(13.1, 7.7);
		amplitude *= 0.5;
	}
	return value;
}

void main() {
	float time = uTime * uSpeed * 0.12 + uSeed;

	float y = vUv.y;
	float x = (vUv.x - 0.5) * 2.0;

	float tipWeight = pow(y, 1.7);

	float sway =
		sin(time * 1.65) * 0.10 +
		sin(time * 2.73 + 1.7) * 0.045;

	float curl = sin(time * 4.1 + y * 7.0) * 0.045 * tipWeight;

	float flowA = fbm(vec2(x * 1.45 + uSeed, y * 3.2 - time * 1.45));
	float flowB = fbm(vec2(x * 3.1 - uSeed * 0.31, y * 6.5 - time * 2.1));

	float turbulence = (flowA - 0.5) * 0.13 + (flowB - 0.5) * 0.045;

	float center = sway * tipWeight + curl + turbulence * (0.25 + tipWeight);
	float localX = x - center;

	float tip = clamp(
		1.0 + sin(time * 3.7) * 0.025 + (flowA - 0.5) * 0.035,
		0.92,
		1.08
	);

	float normalizedY = clamp(y / tip, 0.0, 1.0);

	float width = 0.50 * pow(max(1.0 - normalizedY, 0.0), 0.68);
	width *= mix(0.72, 1.0, smoothstep(0.0, 0.18, normalizedY));

	float edgeNoise = (flowB - 0.5) * 0.075 * (0.25 + normalizedY);
	width += edgeNoise;

	float radial = abs(localX) / max(width, 0.001);

	float sideMask = 1.0 - smoothstep(0.84, 1.08, radial);
	float baseMask = smoothstep(-0.04, 0.075, y);
	float tipMask = 1.0 - smoothstep(tip - 0.09, tip + 0.015, y);

	float flame = sideMask * baseMask * tipMask;

	float tonguePhase = fract(time * 0.24 + uSeed * 0.17);
	float tongueLife =
		smoothstep(0.0, 0.18, tonguePhase) *
		(1.0 - smoothstep(0.60, 1.0, tonguePhase));

	vec2 tongueCenter = vec2(
		center + sin(time * 3.4 + uSeed) * 0.14,
		0.61 + tonguePhase * 0.34
	);
	vec2 tongueDelta = vec2(
		(x - tongueCenter.x) / 0.12,
		(y - tongueCenter.y) / 0.18
	);
	float tongue = 1.0 - smoothstep(0.55, 1.0, length(tongueDelta));
	tongue *= tongueLife;

	flame = max(flame, tongue * 0.88);

	if (flame <= 0.01) discard;

	float pulse = sin(time * 3.5 + flowA * 3.0) * 0.035;
	float heat = 1.0 - radial * 0.72 - normalizedY * 0.18 + pulse;

	vec3 color = uGlow;
	color = mix(color, uEdge, smoothstep(0.12, 0.18, heat));
	color = mix(color, uMid, smoothstep(0.31, 0.38, heat));
	color = mix(color, uHot, smoothstep(0.53, 0.61, heat));
	color = mix(color, uCore, smoothstep(0.76, 0.84, heat));

	float fringeAlpha = smoothstep(0.02, 0.28, flame);
	float alpha = mix(0.42, 1.0, fringeAlpha);

	gl_FragColor = vec4(color, alpha);
}
`;

interface Props {
	seed?: number;
	width?: number;
	height?: number;
	speed?: number;
	planes?: number;
	lodDistance?: number;
}

function makeMaterial(seed: number, speed: number): THREE.ShaderMaterial {
	const material = new THREE.ShaderMaterial({
		vertexShader: VERT,
		fragmentShader: FRAG,
		transparent: true,
		depthWrite: false,
		depthTest: true,
		side: THREE.DoubleSide,
		toneMapped: false,
		uniforms: {
			uTime: { value: 0 },
			uSeed: { value: seed },
			uSpeed: { value: speed },
			uCore: { value: new THREE.Color(0xfff8dc) },
			uHot: { value: new THREE.Color(0xffdc57) },
			uMid: { value: new THREE.Color(0xff922f) },
			uEdge: { value: new THREE.Color(0xef4519) },
			uGlow: { value: new THREE.Color(0x9f210e) },
		},
	});
	material.alphaToCoverage = true;
	return material;
}

export function Flame({
	seed = 0,
	width = 0.66,
	height = 1,
	speed = 12,
	planes = 3,
	lodDistance = 9,
}: Props) {
	const ref = useRef<THREE.Group>(null);
	const wp = useRef(new THREE.Vector3());
	const far = useRef(false);

	const geometry = useMemo(
		() => new THREE.PlaneGeometry(width, height),
		[width, height],
	);

	const count = Math.max(1, planes);
	const materials = useMemo(
		() =>
			Array.from({ length: count }, (_, i) =>
				makeMaterial(seed + i * 3.713, speed),
			),
		[seed, speed, count],
	);

	useEffect(() => {
		return () => {
			geometry.dispose();
			for (const m of materials) m.dispose();
		};
	}, [geometry, materials]);

	useFrame((state) => {
		const time = state.clock.elapsedTime;
		for (const m of materials) m.uniforms.uTime.value = time;

		const g = ref.current;
		if (!g) return;
		g.getWorldPosition(wp.current);
		const cam = state.camera;
		const dist = wp.current.distanceTo(cam.position);
		// hysteresis band so it doesn't flip-flop at the boundary
		const nowFar = far.current
			? dist > lodDistance - 0.75
			: dist > lodDistance + 0.75;
		far.current = nowFar;

		if (nowFar) {
			g.rotation.y = Math.atan2(
				cam.position.x - wp.current.x,
				cam.position.z - wp.current.z,
			);
		} else {
			g.rotation.y = 0;
		}
		for (let i = 1; i < g.children.length; i++) {
			g.children[i].visible = !nowFar;
		}
	});

	return (
		<group ref={ref} position={[0, height * 0.5, 0]}>
			{materials.map((material, i) => (
				<mesh
					key={i}
					geometry={geometry}
					material={material}
					rotation={[0, (i / count) * Math.PI, 0]}
					renderOrder={10}
				/>
			))}
		</group>
	);
}
