import * as THREE from 'three';

export type HeldKind = 'empty' | 'tool' | 'weapon' | 'shield';

// Which hand an item wants. 'main' = right (weapons, tools), 'off' = left
// (shields), 'light' = flexible light source (torch): takes the right hand when
// it is free, otherwise slides to the left so a weapon can own the right.
export type HandSlot = 'main' | 'off' | 'light';

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
	modelUrl?: string;
	// Overrides the hand derived from `kind`. Torches set 'light'.
	slot?: HandSlot;
	grip?: {
		pos: [number, number, number];
		rot: [number, number, number];
		scale: number;
		aim?: [number, number, number];
		roll?: number;
	};
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
		id: 'torch',
		kind: 'tool',
		label: 'torch',
		primary: 'mount',
		secondary: 'grab',
		reload: false,
		primaryImpulse: USE,
		secondaryImpulse: REACH,
		buildItem: () => null,
		modelUrl: '/models/torch.glb',
		slot: 'light',
		grip: {
			pos: [0.02, -0.05, 0.06],
			rot: [-1.4, 0.1, 0],
			scale: 4.2,
		},
	},
	{
		id: 'crate',
		kind: 'tool',
		label: 'crate',
		primary: 'place',
		secondary: 'break',
		reload: false,
		primaryImpulse: USE,
		secondaryImpulse: REACH,
		buildItem: () => null,
		modelUrl: '/models/crate.glb',
		grip: {
			pos: [0.1, -0.12, 0.15],
			rot: [0.2, 0.4, 0],
			scale: 0.45,
		},
	},
	{
		id: 'sword',
		kind: 'weapon',
		label: 'sword',
		primary: 'swing',
		secondary: 'guard',
		reload: false,
		primaryImpulse: FIRE,
		secondaryImpulse: NONE,
		buildItem: () => null,
		modelUrl: '/models/sword.glb',
		grip: {
			pos: [0, 0, 0],
			rot: [0, 0, 0],
			scale: 8,
		},
	},
	{
		id: 'torch',
		kind: 'tool',
		label: 'torch',
		primary: 'wave',
		secondary: 'grab',
		reload: false,
		primaryImpulse: USE,
		secondaryImpulse: REACH,
		buildItem: () => null,
		modelUrl: '/models/torch.glb',
		slot: 'light',
		grip: {
			pos: [0.02, -0.05, 0.06],
			rot: [-1.4, 0.1, 0],
			scale: 4.2,
		},
	},
];

export function equipmentById(id: string): Equipment {
	return LOADOUT.find((e) => e.id === id) ?? LOADOUT[0];
}

// Hand an item wants, or null for bare hands. Explicit `slot` wins; otherwise a
// weapon/tool is main-hand and a shield is off-hand.
export function slotOf(id: string): HandSlot | null {
	const e = equipmentById(id);
	if (e.kind === 'empty') return null;
	if (e.slot) return e.slot;
	if (e.kind === 'shield') return 'off';
	return 'main';
}
