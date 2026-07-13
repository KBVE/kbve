import * as THREE from 'three';

// GPU-animated ember sparks rising off a torch flame. Every particle loops on its
// own phase entirely in the vertex shader (position from uTime + a per-point seed),
// so there is zero CPU work per frame — the flame's frame loop only advances uTime.
// Points live in the flame group's local space, so they inherit its world-upright
// orientation and rise along world +Y.

const EMBER_COUNT = 16;
const EMBER_SIZE = 26; // perspective point-size gain — raise for chunkier sparks

const VERT = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uSize;
uniform vec3 uVel;

attribute float aSeed;

varying float vLife;

float hash(float n) {
	return fract(sin(n) * 43758.5453123);
}

void main() {
	// Each ember rides a looping 0..1 life offset by its seed so they stagger.
	float life = fract(uTime * 0.35 + aSeed);
	vLife = life;

	float sx = hash(aSeed) * 2.0 - 1.0;
	float sz = hash(aSeed + 1.7) * 2.0 - 1.0;

	vec3 pos;
	pos.x = sx * 0.10 + 0.12 * sin(uTime * 2.0 + aSeed * 10.0) * life;
	pos.z = sz * 0.10 + 0.10 * cos(uTime * 1.7 + aSeed * 8.0) * life;
	pos.y = 0.28 + life * 1.25;

	// Drag: older sparks lag further behind the flame's motion, so a fast swing
	// smears the ember cloud into a trailing streak. The group is world-upright,
	// so world velocity maps straight onto the local axes.
	pos -= uVel * (life * life) * 0.11;

	vec4 mv = modelViewMatrix * vec4(pos, 1.0);
	gl_Position = projectionMatrix * mv;

	float grow = (1.0 - life) * 0.8 + 0.4;
	gl_PointSize = uSize * grow / max(-mv.z, 0.001);
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform vec3 uHot;
uniform vec3 uCool;

varying float vLife;

void main() {
	vec2 d = gl_PointCoord - 0.5;
	float r = length(d);
	if (r > 0.5) discard;

	float soft = 1.0 - smoothstep(0.12, 0.5, r);
	// Fade in at spawn, dim as it climbs and cools.
	float fade = smoothstep(0.0, 0.12, vLife) * (1.0 - vLife);

	vec3 col = mix(uHot, uCool, vLife);
	gl_FragColor = vec4(col * (0.7 + fade), soft * fade);
}
`;

// Shared, position-less geometry: the vertex shader derives every position from
// aSeed + uTime, so all torches reuse one immutable buffer. Only the per-torch
// material (with its own uTime) is created and disposed per equip.
const EMBER_GEO = (() => {
	const geo = new THREE.BufferGeometry();
	const positions = new Float32Array(EMBER_COUNT * 3);
	const seeds = new Float32Array(EMBER_COUNT);
	for (let i = 0; i < EMBER_COUNT; i++) seeds[i] = Math.random();
	geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
	return geo;
})();

export function buildEmbers(): {
	points: THREE.Points;
	mat: THREE.ShaderMaterial;
} {
	const mat = new THREE.ShaderMaterial({
		vertexShader: VERT,
		fragmentShader: FRAG,
		transparent: true,
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		depthTest: true,
		toneMapped: false,
		uniforms: {
			uTime: { value: 0 },
			uSize: { value: EMBER_SIZE },
			uVel: { value: new THREE.Vector3() },
			uHot: { value: new THREE.Color(0xffd36b) },
			uCool: { value: new THREE.Color(0xd23a12) },
		},
	});

	const points = new THREE.Points(EMBER_GEO, mat);
	points.frustumCulled = false;
	points.renderOrder = 11;
	return { points, mat };
}
