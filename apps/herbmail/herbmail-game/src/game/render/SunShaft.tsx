import { useMemo } from 'react';
import * as THREE from 'three';
import { WALL_H } from '../config';
import { DOME_RISE, DOME_OCULUS } from '../geometry/domes';
import { useOases } from '../water/oasis';

// Fake volumetric light shaft: two crossed additive quads per oasis, dropping
// straight down from the dome's oculus onto the water. No raymarch / post pass —
// additive blending fakes the volume, which keeps it off the perf budget
// (Safari-safe).

const shaftMaterial = () =>
	new THREE.ShaderMaterial({
		uniforms: { uColor: { value: new THREE.Color(1.0, 0.9, 0.62) } },
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			varying vec2 vUv;
			void main() {
				// Soft peak down the centre line, brightest at the opening (top),
				// dissipating toward the water.
				float horiz = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
				float vert = mix(0.0, 0.55, vUv.y);
				float a = horiz * vert;
				gl_FragColor = vec4(uColor * a, a);
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending,
		side: THREE.DoubleSide,
		toneMapped: false,
	});

export function SunShaft() {
	const oases = useOases();
	const mat = useMemo(() => shaftMaterial(), []);

	return (
		<>
			{oases.map((o) => {
				// Oculus sits at the dome apex; the beam drops from there to water.
				const topY = WALL_H + o.roomHalfMin * DOME_RISE;
				const len = topY - o.surfaceY;
				const centerY = o.surfaceY + len / 2;
				const width = o.roomHalfMin * DOME_OCULUS * 2.4;
				return (
					<group key={o.id} position={[o.cx, centerY, o.cz]}>
						<mesh material={mat}>
							<planeGeometry args={[width, len]} />
						</mesh>
						<mesh material={mat} rotation={[0, Math.PI / 2, 0]}>
							<planeGeometry args={[width, len]} />
						</mesh>
					</group>
				);
			})}
		</>
	);
}
