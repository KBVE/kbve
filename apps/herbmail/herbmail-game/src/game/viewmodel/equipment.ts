import * as THREE from 'three';

export type HeldKind = 'empty' | 'tool' | 'weapon';

export interface Impulse {
	back: number;
	kick: number;
	roll: number;
	push: number;
}

export interface Equipment {
	id: string;
	kind: HeldKind;
	label: string;
	primary: string;
	secondary: string;
	reload: boolean;
	primaryImpulse: Impulse;
	secondaryImpulse: Impulse;
	buildItem: () => THREE.Object3D | null;
}

const NONE: Impulse = { back: 0, kick: 0, roll: 0, push: 0 };
const REACH: Impulse = { back: 0, kick: 0, roll: 0, push: 1 };
const FIRE: Impulse = { back: 1, kick: 1, roll: 1, push: 0 };
const USE: Impulse = { back: 0.3, kick: 0.2, roll: 0, push: 0.4 };

function unlit(color: number, emissive = 0): THREE.MeshBasicMaterial {
	const m = new THREE.MeshBasicMaterial({ color });
	m.toneMapped = false;
	if (emissive) m.color.multiplyScalar(1 + emissive);
	return m;
}

function buildFlashlight(): THREE.Object3D {
	const g = new THREE.Group();
	const body = new THREE.Mesh(
		new THREE.CylinderGeometry(0.18, 0.22, 1.1, 8),
		unlit(0x2a2a30),
	);
	body.rotation.x = Math.PI / 2;
	const lens = new THREE.Mesh(
		new THREE.CylinderGeometry(0.2, 0.2, 0.08, 8),
		unlit(0xfff2b0, 0.8),
	);
	lens.rotation.x = Math.PI / 2;
	lens.position.z = 0.58;
	g.add(body, lens);
	g.scale.setScalar(1.2);
	return g;
}

function buildPistol(): THREE.Object3D {
	const g = new THREE.Group();
	const grip = new THREE.Mesh(
		new THREE.BoxGeometry(0.22, 0.55, 0.28),
		unlit(0x1c1c22),
	);
	grip.rotation.x = -0.35;
	const slide = new THREE.Mesh(
		new THREE.BoxGeometry(0.24, 0.26, 0.95),
		unlit(0x33333a),
	);
	slide.position.set(0, 0.34, 0.35);
	const barrel = new THREE.Mesh(
		new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6),
		unlit(0x0a0a0c),
	);
	barrel.rotation.x = Math.PI / 2;
	barrel.position.set(0, 0.34, 0.9);
	g.add(grip, slide, barrel);
	g.scale.setScalar(1.1);
	return g;
}

export const LOADOUT: Equipment[] = [
	{
		id: 'empty',
		kind: 'empty',
		label: 'bare hands',
		primary: 'push',
		secondary: 'grab',
		reload: false,
		primaryImpulse: REACH,
		secondaryImpulse: REACH,
		buildItem: () => null,
	},
	{
		id: 'flashlight',
		kind: 'tool',
		label: 'flashlight',
		primary: 'toggle',
		secondary: 'grab',
		reload: false,
		primaryImpulse: USE,
		secondaryImpulse: REACH,
		buildItem: buildFlashlight,
	},
	{
		id: 'pistol',
		kind: 'weapon',
		label: 'pistol',
		primary: 'fire',
		secondary: 'aim',
		reload: true,
		primaryImpulse: FIRE,
		secondaryImpulse: NONE,
		buildItem: buildPistol,
	},
];

export function equipmentById(id: string): Equipment {
	return LOADOUT.find((e) => e.id === id) ?? LOADOUT[0];
}
