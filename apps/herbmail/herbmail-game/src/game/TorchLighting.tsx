import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useTorches } from './torches';
import { MAX_LIGHTS } from './PsxMaterial';

const FLAME_COLOR = new THREE.Color(0xff8a3c);
const BASE_INTENSITY = 5.5;
const HEAD_OFFSET = 0.28;

interface Lamp {
	pos: THREE.Vector3;
	phase: number;
	room: number;
}

export function TorchLighting({ ambient = 0.12 }: { ambient?: number }) {
	const torches = useTorches();
	const scene = useThree((s) => s.scene);

	const lamps = useMemo<Lamp[]>(
		() =>
			torches.map((t) => {
				const d = new THREE.Vector3(...t.dir).normalize();
				return {
					pos: new THREE.Vector3(
						t.pos[0] + d.x * 1.122,
						t.pos[1] + d.y * 1.122 + HEAD_OFFSET,
						t.pos[2] + d.z * 1.122,
					),
					phase: (t.id * 12.9898) % (Math.PI * 2),
					room: t.room,
				};
			}),
		[torches],
	);

	const pool = useMemo(
		() => ({
			pos: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()),
			col: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()),
			ranked: [] as { lamp: Lamp; dist: number; intensity: number }[],
		}),
		[],
	);

	useFrame((state) => {
		const cam = state.camera;
		const t = state.clock.elapsedTime;

		pool.ranked.length = 0;
		for (const lamp of lamps) {
			const dist = lamp.pos.distanceToSquared(cam.position);
			const f =
				0.75 +
				0.15 * Math.sin(t * 11 + lamp.phase) +
				0.1 * Math.sin(t * 23.3 + lamp.phase * 2.1);
			pool.ranked.push({
				lamp,
				dist,
				intensity: BASE_INTENSITY * f,
			});
		}
		pool.ranked.sort((a, b) => a.dist - b.dist);
		const count = Math.min(pool.ranked.length, MAX_LIGHTS);

		for (let i = 0; i < count; i++) {
			const { lamp, intensity } = pool.ranked[i];
			pool.pos[i].copy(lamp.pos);
			pool.col[i]
				.set(FLAME_COLOR.r, FLAME_COLOR.g, FLAME_COLOR.b)
				.multiplyScalar(intensity);
		}

		scene.traverse((obj) => {
			const mat = (obj as THREE.Mesh).material as
				| (THREE.ShaderMaterial & {
						uniforms?: Record<string, { value: unknown }>;
				  })
				| undefined;
			const u = mat?.uniforms;
			if (!u || !u.uLightPos) return;
			u.uLightCount.value = count;
			u.uAmbient.value = ambient;
			(u.uLightPos.value as THREE.Vector3[]).forEach((v, i) =>
				v.copy(pool.pos[i]),
			);
			(u.uLightColor.value as THREE.Vector3[]).forEach((v, i) =>
				v.copy(pool.col[i]),
			);
		});
	});

	return null;
}
