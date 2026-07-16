import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { farSpawnPoints } from './spawn';
import { getDungeon } from '../dungeon/store';
import { CharState, Transform3, Wander, isAlive } from '../mecs/props';
import { CS } from '../character/charState';
import { NPC_KURENAI, despawnGoblin, spawnGoblin } from './goblinSim';

const KURENAI_URL = '/models/parts/kurenai.glb';
useGLTF.preload(KURENAI_URL);

// spring-bone secondary motion for the cosmetic cloth chains that the baked
// clips do not key (scarf / smoke wisp / thigh flaps). World-space verlet: the
// tail keeps its previous world position while the head follows the animation,
// so movement and turns naturally drag the cloth, then stiffness + gravity pull
// it back to rest.
interface SpringCfg {
	root: string;
	stiffness: number;
	gravity: number;
	drag: number;
}
const SPRINGS: SpringCfg[] = [
	{ root: 'Cape_Spine', stiffness: 2.4, gravity: 1.1, drag: 0.4 },
	{ root: 'Smoke', stiffness: 1.4, gravity: -0.3, drag: 0.5 },
	{ root: 'Tissue.L', stiffness: 3.0, gravity: 1.5, drag: 0.34 },
	{ root: 'Tissue.R', stiffness: 3.0, gravity: 1.5, drag: 0.34 },
];
const TIP_LEN = 0.06;
const GRAV_DIR = new THREE.Vector3(0, -1, 0);

interface Joint {
	bone: THREE.Bone;
	prevTail: THREE.Vector3;
	currTail: THREE.Vector3;
	axis: THREE.Vector3;
	len: number;
	rest: THREE.Quaternion;
	cfg: SpringCfg;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _head = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();

function buildSprings(scene: THREE.Object3D): Joint[] {
	const joints: Joint[] = [];
	for (const cfg of SPRINGS) {
		let b = scene.getObjectByName(cfg.root) as THREE.Bone | undefined;
		while (b) {
			const child = b.children.find((c) => (c as THREE.Bone).isBone) as
				| THREE.Bone
				| undefined;
			const axis = new THREE.Vector3();
			let len: number;
			if (child && child.position.length() > 1e-4) {
				axis.copy(child.position);
				len = axis.length();
			} else {
				axis.set(0, 1, 0);
				len = TIP_LEN;
			}
			axis.normalize();
			b.updateWorldMatrix(true, false);
			const head = b.getWorldPosition(new THREE.Vector3());
			const wq = b.getWorldQuaternion(new THREE.Quaternion());
			const tail = axis
				.clone()
				.applyQuaternion(wq)
				.multiplyScalar(len)
				.add(head);
			joints.push({
				bone: b,
				prevTail: tail.clone(),
				currTail: tail.clone(),
				axis: axis.clone(),
				len,
				rest: b.quaternion.clone(),
				cfg,
			});
			b = child;
		}
	}
	return joints;
}

function updateSprings(joints: Joint[], dt: number): void {
	const step = Math.min(dt, 1 / 30);
	for (const j of joints) {
		const parent = j.bone.parent;
		if (!parent) continue;
		j.bone.getWorldPosition(_head);
		parent.getWorldQuaternion(_q1);
		const worldRest = _q2.copy(_q1).multiply(j.rest);
		const restDir = _v1.copy(j.axis).applyQuaternion(worldRest);
		const inertia = _v2
			.copy(j.currTail)
			.sub(j.prevTail)
			.multiplyScalar(1 - j.cfg.drag);
		const next = _v3.copy(j.currTail).add(inertia);
		next.addScaledVector(restDir, j.cfg.stiffness * step * j.len);
		next.addScaledVector(GRAV_DIR, j.cfg.gravity * step * j.len);
		next.sub(_head).normalize().multiplyScalar(j.len).add(_head);
		j.prevTail.copy(j.currTail);
		j.currTail.copy(next);
		_dir.copy(next).sub(_head).normalize();
		const swing = _q3.setFromUnitVectors(restDir, _dir);
		const world = swing.multiply(worldRest);
		j.bone.quaternion.copy(_q1.invert().multiply(world));
		j.bone.updateWorldMatrix(false, true);
	}
}

const RESPAWN_DELAY = 6;
const COUNT = 1;
const KURENAI_RADIUS = 0.4;
const WALK_SPEED = 1.0;
const RUN_SPEED = 2.4;
const WALK_MIN = 0.12;
const RUN_MIN = 1.7;
const FADE = 0.18;
const TURN_LERP = 9;

interface Slot {
	x: number;
	z: number;
	eid: number;
	gen: number;
	respawnAt: number;
}

function clipFor(speed: number): string {
	if (speed < WALK_MIN) return 'Idle_Loop';
	if (speed < RUN_MIN) return 'Walk_Loop';
	return 'Jog_Fwd_Loop';
}

function KurenaiActor({ slot }: { slot: Slot }) {
	const gltf = useGLTF(KURENAI_URL);
	const scene = useMemo(() => {
		const s = cloneSkinned(gltf.scene);
		s.traverse((o) => {
			if ((o as THREE.Mesh).isMesh) {
				o.castShadow = true;
				o.frustumCulled = false;
			}
		});
		return s;
	}, [gltf]);
	const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
	const actions = useMemo(() => {
		const map = new Map<string, THREE.AnimationAction>();
		for (const clip of gltf.animations)
			map.set(clip.name, mixer.clipAction(clip));
		return map;
	}, [gltf, mixer]);
	const group = useRef<THREE.Group>(null);
	const current = useRef<string>('');
	const springs = useMemo(() => buildSprings(scene), [scene]);

	useEffect(() => {
		const idle = actions.get('Idle_Loop');
		if (idle) {
			idle.play();
			current.current = 'Idle_Loop';
		}
		return () => {
			mixer.stopAllAction();
		};
	}, [actions, mixer]);

	useFrame((_, dt) => {
		const g = group.current;
		const eid = slot.eid;
		if (!g || eid < 0) return;
		g.position.set(
			Transform3.px[eid],
			Transform3.py[eid],
			Transform3.pz[eid],
		);
		if (CharState.bits[eid] & CS.DEAD) {
			if (current.current !== 'Death_D') {
				const death = actions.get('Death_D');
				const prev = actions.get(current.current);
				if (death) {
					death.reset();
					death.clampWhenFinished = true;
					death.setLoop(THREE.LoopOnce, 1);
					death.play();
					if (prev) prev.crossFadeTo(death, 0.12, false);
					current.current = 'Death_D';
				}
			}
			mixer.update(dt);
			g.updateWorldMatrix(true, true);
			updateSprings(springs, dt);
			return;
		}
		const vx = Wander.vx[eid];
		const vz = Wander.vz[eid];
		const speed = Math.hypot(vx, vz);
		if (speed > WALK_MIN) {
			const yaw = Math.atan2(vx, vz);
			const cur = g.rotation.y;
			let d = yaw - cur;
			while (d > Math.PI) d -= Math.PI * 2;
			while (d < -Math.PI) d += Math.PI * 2;
			g.rotation.y = cur + d * Math.min(1, TURN_LERP * dt);
		}
		const want = clipFor(speed);
		if (want !== current.current) {
			const next = actions.get(want);
			const prev = actions.get(current.current);
			if (next) {
				next.reset().play();
				next.timeScale = want === 'Walk_Loop' ? speed / WALK_SPEED : 1;
				if (prev) prev.crossFadeTo(next, FADE, false);
				current.current = want;
			}
		} else if (want === 'Walk_Loop') {
			const a = actions.get('Walk_Loop');
			if (a) a.timeScale = Math.max(0.6, speed / WALK_SPEED);
		}
		mixer.update(dt);
		g.updateWorldMatrix(true, true);
		updateSprings(springs, dt);
	});

	return (
		<group ref={group} position={[slot.x, 0, slot.z]}>
			<primitive object={scene} />
		</group>
	);
}

const KURENAI_MIN_RING = 12;

export function KurenaiNpc() {
	const slots = useMemo<Slot[]>(
		() =>
			farSpawnPoints(COUNT, KURENAI_MIN_RING).map(([x, z]) => ({
				x,
				z,
				eid: -1,
				gen: 0,
				respawnAt: 0,
			})),
		[],
	);
	const [, force] = useState(0);

	useEffect(() => {
		const world = getDungeon().world;
		for (const s of slots)
			s.eid = spawnGoblin(
				world,
				s.x,
				s.z,
				KURENAI_RADIUS,
				WALK_SPEED,
				RUN_SPEED,
				NPC_KURENAI,
			);
		return () => {
			for (const s of slots) {
				if (s.eid >= 0) despawnGoblin(world, s.eid);
				s.eid = -1;
			}
		};
	}, [slots]);

	useFrame((state) => {
		const world = getDungeon().world;
		const t = state.clock.elapsedTime;
		let changed = false;
		for (const s of slots) {
			if (s.eid >= 0 && !isAlive(world, s.eid)) {
				s.eid = -1;
				s.gen++;
				s.respawnAt = t + RESPAWN_DELAY;
				changed = true;
			} else if (s.eid < 0 && s.respawnAt > 0 && t >= s.respawnAt) {
				const [nx, nz] = farSpawnPoints(1, KURENAI_MIN_RING)[0] ?? [s.x, s.z];
				s.x = nx;
				s.z = nz;
				s.respawnAt = 0;
				s.eid = spawnGoblin(
					world,
					nx,
					nz,
					KURENAI_RADIUS,
					WALK_SPEED,
					RUN_SPEED,
					NPC_KURENAI,
				);
				changed = true;
			}
		}
		if (changed) force((n) => n + 1);
	});

	return (
		<>
			{slots.map((s, i) =>
				s.eid < 0 ? null : (
					<KurenaiActor key={`${i}-${s.gen}`} slot={s} />
				),
			)}
		</>
	);
}
