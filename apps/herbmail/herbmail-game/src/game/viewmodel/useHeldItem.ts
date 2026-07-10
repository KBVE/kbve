import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { makePsxViewmodelMaterial } from './psxSkinnedMaterial';
import { type ArmSide } from './config';
import { equipmentById } from './equipment';

const SWORD_URL = '/models/sword.glb';
const TORCH_URL = '/models/torch.glb';
useGLTF.preload(SWORD_URL);
useGLTF.preload(TORCH_URL);

function norm(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface Knuckle {
	bone: THREE.Bone;
	seg: number;
	rest: THREE.Quaternion;
}

interface Finger {
	key: string;
	segs: Knuckle[];
	tip: THREE.Bone;
}

interface HandBones {
	fingers: Finger[];
	thumb: Finger[];
}

const GRIP = {
	fingerAxis: [1, 0, 0] as [number, number, number],
	thumbAxis: [1, 0, 0] as [number, number, number],
	segScale: [0.75, 1.05, 1.2] as [number, number, number],
	thetaMax: 2.8,
	contactR: 0.0,
	solveIters: 12,
	lerp: 12,
	gripY: 0.82,
	handleModelR: 0.02,
};

const BLADE_AXIS = new THREE.Vector3(0, -1, 0);

function findSocket(
	root: THREE.Object3D,
	socketName: string,
): THREE.Object3D | null {
	const flat = socketName.replace(/\./g, '');
	return (
		root.getObjectByName(flat) ?? root.getObjectByName(socketName) ?? null
	);
}

function findHandBones(root: THREE.Object3D, sideKey: string): HandBones {
	const groups = new Map<string, Knuckle[]>();
	const segRe = new RegExp(`([123])${sideKey}$`);
	const keyRe = new RegExp(`[123]?${sideKey}$`);
	root.traverse((o) => {
		if (!(o as THREE.Bone).isBone) return;
		const n = norm(o.name);
		if (!n.startsWith('finger') || !n.endsWith(sideKey)) return;
		const seg = Number(n.match(segRe)?.[1] ?? '1');
		const key = n.slice(6).replace(keyRe, '');
		const k: Knuckle = {
			bone: o as THREE.Bone,
			seg,
			rest: (o as THREE.Bone).quaternion.clone(),
		};
		const arr = groups.get(key) ?? [];
		arr.push(k);
		groups.set(key, arr);
	});
	const fingers: Finger[] = [];
	const thumb: Finger[] = [];
	for (const [key, arr] of groups) {
		arr.sort((a, b) => a.seg - b.seg);
		const f: Finger = { key, segs: arr, tip: arr[arr.length - 1].bone };
		if (key.includes('thumb')) thumb.push(f);
		else fingers.push(f);
	}
	return { fingers, thumb };
}

function dressPsx(root: THREE.Object3D, snap: number): void {
	let map: THREE.Texture | null = null;
	root.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (mesh.isMesh && !map) {
			map = (mesh.material as THREE.MeshStandardMaterial).map ?? null;
		}
	});
	const psx = makePsxViewmodelMaterial(map, snap);
	root.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh) return;
		mesh.material = psx.material;
		mesh.frustumCulled = false;
		mesh.renderOrder = 999;
		mesh.raycast = () => undefined;
		mesh.userData.held = true;
	});
}

function addBladeCollider(inner: THREE.Object3D): THREE.Mesh {
	const box = new THREE.Mesh(
		new THREE.BoxGeometry(0.05, 0.66, 0.05),
		new THREE.MeshBasicMaterial(),
	);
	box.position.set(0, 0.33, 0);
	box.visible = false;
	box.userData.held = true;
	box.userData.collider = 'blade';
	box.raycast = THREE.Mesh.prototype.raycast;
	inner.add(box);
	return box;
}

export function useHeldItem(
	gltf: { scene: THREE.Object3D },
	itemId: string,
	snap: number,
	side: ArmSide,
): void {
	const camera = useThree((s) => s.camera);
	const sword = useGLTF(SWORD_URL);
	const torch = useGLTF(TORCH_URL);
	const handRef = useRef<HandBones | null>(null);
	const socketRef = useRef<THREE.Object3D | null>(null);
	const heldRef = useRef<THREE.Object3D | null>(null);
	const aimedRef = useRef(false);
	const gripWeight = useRef(0);
	const gripTarget = useRef(0);
	const s = useRef({
		socketQ: new THREE.Quaternion(),
		camQ: new THREE.Quaternion(),
		dirWorld: new THREE.Vector3(),
		aim: new THREE.Quaternion(),
		local: new THREE.Quaternion(),
		fAxis: new THREE.Vector3(),
		tAxis: new THREE.Vector3(),
		axisP: new THREE.Vector3(),
		tipW: new THREE.Vector3(),
		vTmp: new THREE.Vector3(),
		bend: new THREE.Quaternion(),
		scale: new THREE.Vector3(),
	});

	useEffect(() => {
		const socket = findSocket(gltf.scene, side.socket);
		if (!socket) return;
		socketRef.current = socket;

		for (let i = socket.children.length - 1; i >= 0; i--) {
			if (socket.children[i].userData.held) {
				socket.remove(socket.children[i]);
			}
		}
		heldRef.current = null;

		const equip = equipmentById(itemId);
		let held: THREE.Object3D | null = null;
		let aimed = false;
		let curls = equip.kind !== 'empty';

		if (equip.modelUrl === SWORD_URL) {
			const inner = sword.scene.clone(true);
			dressPsx(inner, snap);
			inner.position.y = -GRIP.gripY;
			addBladeCollider(inner);
			const pivot = new THREE.Group();
			pivot.userData.held = true;
			pivot.add(inner);
			held = pivot;
			aimed = true;
		} else if (equip.modelUrl === TORCH_URL) {
			const inner = torch.scene.clone(true);
			dressPsx(inner, snap);
			inner.userData.held = true;
			held = inner;
		} else if (equip.buildItem) {
			held = equip.buildItem();
			if (held) held.userData.held = true;
			else curls = false;
		} else {
			curls = false;
		}

		if (held) {
			const g = equip.grip;
			if (g) {
				held.position.fromArray(g.pos);
				held.scale.setScalar(g.scale);
				if (!aimed) held.rotation.set(g.rot[0], g.rot[1], g.rot[2]);
			}
			socket.add(held);
			heldRef.current = held;
		}

		gripTarget.current = curls ? 1 : 0;
		aimedRef.current = aimed;
		const mounted = held;
		return () => {
			if (mounted) socket.remove(mounted);
			if (heldRef.current === mounted) heldRef.current = null;
		};
	}, [gltf, sword, torch, itemId, snap, side]);

	useFrame((_, dtRaw) => {
		const st = s.current;
		const held = heldRef.current;
		const socket = socketRef.current;
		if (held && socket && aimedRef.current) {
			socket.getWorldQuaternion(st.socketQ);
			camera.getWorldQuaternion(st.camQ);
			st.dirWorld
				.fromArray(side.bladeCam)
				.normalize()
				.applyQuaternion(st.camQ);
			st.aim.setFromUnitVectors(BLADE_AXIS, st.dirWorld);
			st.local.copy(st.socketQ).invert().multiply(st.aim);
			held.quaternion.copy(st.local);
		} else if (held) {
			held.getWorldQuaternion(st.socketQ);
			st.dirWorld.set(0, 1, 0).applyQuaternion(st.socketQ).normalize();
		}

		if (!handRef.current) {
			handRef.current = findHandBones(gltf.scene, side.key);
		}
		const hand = handRef.current;
		if (!hand.fingers.length) return;

		const dt = Math.min(dtRaw, 0.05);
		gripWeight.current = THREE.MathUtils.damp(
			gripWeight.current,
			gripTarget.current,
			GRIP.lerp,
			dt,
		);
		const w = gripWeight.current;
		if (w < 0.001) return;

		if (!held || !socket) return;
		held.getWorldPosition(st.axisP);
		held.getWorldScale(st.scale);
		const r = GRIP.contactR + GRIP.handleModelR * st.scale.x;

		st.fAxis.fromArray(GRIP.fingerAxis).normalize();
		st.tAxis.fromArray(GRIP.thumbAxis).normalize();
		for (const f of hand.fingers) solveFinger(f, st.fAxis, r, w, st);
		for (const f of hand.thumb) solveFinger(f, st.tAxis, r, w, st);
	});
}

function applyCurl(
	finger: Finger,
	theta: number,
	axis: THREE.Vector3,
	bend: THREE.Quaternion,
): void {
	for (const k of finger.segs) {
		const a = theta * (GRIP.segScale[k.seg - 1] ?? 1);
		bend.setFromAxisAngle(axis, a);
		k.bone.quaternion.copy(k.rest).multiply(bend);
	}
	finger.segs[0].bone.updateWorldMatrix(false, true);
}

function distToAxis(
	tip: THREE.Vector3,
	axisP: THREE.Vector3,
	axisDir: THREE.Vector3,
	tmp: THREE.Vector3,
): number {
	tmp.subVectors(tip, axisP);
	const t = tmp.dot(axisDir);
	tmp.copy(axisDir).multiplyScalar(t).add(axisP);
	return tip.distanceTo(tmp);
}

function solveFinger(
	finger: Finger,
	axis: THREE.Vector3,
	r: number,
	w: number,
	st: {
		axisP: THREE.Vector3;
		dirWorld: THREE.Vector3;
		tipW: THREE.Vector3;
		vTmp: THREE.Vector3;
		bend: THREE.Quaternion;
	},
): void {
	let lo = 0;
	let hi = GRIP.thetaMax;
	for (let i = 0; i < GRIP.solveIters; i++) {
		const mid = (lo + hi) * 0.5;
		applyCurl(finger, mid, axis, st.bend);
		finger.tip.getWorldPosition(st.tipW);
		const d = distToAxis(st.tipW, st.axisP, st.dirWorld, st.vTmp);
		if (d > r) lo = mid;
		else hi = mid;
	}
	applyCurl(finger, hi * w, axis, st.bend);
}
