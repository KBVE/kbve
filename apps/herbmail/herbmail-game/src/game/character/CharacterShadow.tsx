import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { LightEmitter, query, Transform3 } from '@kbve/laser/ecs';
import { getDungeon } from '../dungeon/store';
import type { CharacterHandle } from './Character';

const HEAD_REACH = 1.122;
const K = 3; // shadow-casting lights = up to this many nearest torches
const MAXD = 10; // ignore torches past this (they barely light the character)
const FOLLOW = 6;

interface Torch {
	hx: number;
	hz: number;
	w: number;
}

// Multi-torch silhouette shadows: a small pool of shadow-only directional lights,
// each parked on one of the nearest torches and damped independently, so standing
// between torches casts several real shadows that slide and fade fluidly instead
// of one averaged blob. All land on a single transparent ShadowMaterial catcher.
export function CharacterShadow({
	target,
}: {
	target: MutableRefObject<CharacterHandle | null>;
}) {
	const lightRefs = useRef<(THREE.DirectionalLight | null)[]>([]);
	const catcherRef = useRef<THREE.Mesh>(null);
	const targets = useMemo(
		() => Array.from({ length: K }, () => new THREE.Object3D()),
		[],
	);
	const dirs = useRef(
		Array.from({ length: K }, () => new THREE.Vector2(0, -1)),
	);
	const scratch = useRef<Torch[]>([]);

	useFrame((_, dt) => {
		const h = target.current;
		if (!h) return;
		const p = h.motor.position;

		const world = getDungeon().world;
		const list = scratch.current;
		list.length = 0;
		for (const eid of query(world, [LightEmitter, Transform3])) {
			const dx = Transform3.dx[eid];
			const dy = Transform3.dy[eid];
			const dz = Transform3.dz[eid];
			const len = Math.hypot(dx, dy, dz) || 1;
			const hx = Transform3.px[eid] + (dx / len) * HEAD_REACH;
			const hz = Transform3.pz[eid] + (dz / len) * HEAD_REACH;
			const ddx = hx - p.x;
			const ddz = hz - p.z;
			const d2 = ddx * ddx + ddz * ddz;
			if (d2 > MAXD * MAXD) continue;
			list.push({
				hx,
				hz,
				w: LightEmitter.baseIntensity[eid] / (d2 + 0.5),
			});
		}
		list.sort((a, b) => b.w - a.w);

		const k = 1 - Math.exp(-FOLLOW * dt);
		for (let i = 0; i < K; i++) {
			const dl = lightRefs.current[i];
			if (!dl) continue;
			if (i < list.length) {
				const t = list[i];
				const tx = t.hx - p.x;
				const tz = t.hz - p.z;
				const m = Math.hypot(tx, tz) || 1;
				const d = dirs.current[i];
				d.x += (tx / m - d.x) * k;
				d.y += (tz / m - d.y) * k;
				const hl = Math.hypot(d.x, d.y) || 1;
				dl.position.set(
					p.x + (d.x / hl) * 3,
					p.y + 4.5,
					p.z + (d.y / hl) * 3,
				);
				targets[i].position.set(p.x, p.y + 0.1, p.z);
				targets[i].updateMatrixWorld();
				dl.visible = true;
			} else {
				dl.visible = false;
			}
		}

		if (catcherRef.current) catcherRef.current.position.set(p.x, 0.02, p.z);
	});

	return (
		<>
			{Array.from({ length: K }, (_, i) => (
				<directionalLight
					key={i}
					ref={(el) => (lightRefs.current[i] = el)}
					castShadow
					intensity={0}
					target={targets[i]}
					shadow-mapSize-width={1024}
					shadow-mapSize-height={1024}
					shadow-camera-near={0.1}
					shadow-camera-far={12}
					shadow-camera-left={-2.4}
					shadow-camera-right={2.4}
					shadow-camera-top={2.4}
					shadow-camera-bottom={-2.4}
					shadow-bias={-0.0009}
				/>
			))}
			{targets.map((t, i) => (
				<primitive key={i} object={t} />
			))}
			<mesh
				ref={catcherRef}
				rotation-x={-Math.PI / 2}
				receiveShadow
				renderOrder={1}>
				<planeGeometry args={[6, 6]} />
				<shadowMaterial transparent opacity={0.45} depthWrite={false} />
			</mesh>
		</>
	);
}
