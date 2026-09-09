import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ARMOR_PIECES, BODY_BASE } from './armor';
import { applyPartVisibility, slotNameOf } from './partVisibility';

const ARMOR_SLOTS = [
	...new Set(
		ARMOR_PIECES.flatMap((p) => p.slots).filter((s) => !BODY_BASE.has(s)),
	),
];
const SKIN_SLOTS = [...BODY_BASE].filter((n) => n.startsWith('SKIN_'));
const SLOTS = [...ARMOR_SLOTS, ...SKIN_SLOTS];

// The rig as three sees it in dev: the slot name sits on the mesh itself.
function devScene(): THREE.Object3D {
	const root = new THREE.Object3D();
	for (const name of SLOTS) {
		const mesh = new THREE.Mesh();
		mesh.name = name;
		root.add(mesh);
	}
	return root;
}

// The rig as gltfpack emits it: the slot name sits on a wrapper node and the
// mesh underneath is unnamed, so GLTFLoader stamps it 'mesh_N'. This is what
// shipped the armored player.
function packedScene(): THREE.Object3D {
	const root = new THREE.Object3D();
	SLOTS.forEach((name, i) => {
		const wrapper = new THREE.Object3D();
		wrapper.name = name;
		const mesh = new THREE.Mesh();
		mesh.name = `mesh_${i}`;
		wrapper.add(mesh);
		root.add(wrapper);
	});
	return root;
}

function visibilityBySlot(root: THREE.Object3D): Map<string, boolean> {
	const out = new Map<string, boolean>();
	root.traverse((o) => {
		if (!(o as THREE.Mesh).isMesh) return;
		out.set(slotNameOf(o), o.visible);
	});
	return out;
}

describe('applyPartVisibility', () => {
	it('has armor slots to assert against', () => {
		expect(ARMOR_SLOTS.length).toBeGreaterThan(0);
		expect(SKIN_SLOTS.length).toBeGreaterThan(0);
	});

	for (const [shape, build] of [
		['dev', devScene],
		['packed', packedScene],
	] as const) {
		// Assert on presence, not just truthiness: if a slot name fails to
		// resolve, `vis.get(slot)` is undefined and a `.filter(s => vis.get(s))`
		// check would pass vacuously on exactly the rig this guards against.
		it(`${shape} rig: every slot resolves to a real name`, () => {
			const root = build();
			applyPartVisibility(root, new Set());
			const vis = visibilityBySlot(root);
			const unresolved = SLOTS.filter((s) => !vis.has(s));
			expect(unresolved).toEqual([]);
			expect([...vis.keys()].filter((k) => /^mesh_\d+$/.test(k))).toEqual(
				[],
			);
		});

		it(`${shape} rig: nothing equipped hides every armor slot`, () => {
			const root = build();
			applyPartVisibility(root, new Set());
			const vis = visibilityBySlot(root);
			expect(ARMOR_SLOTS.map((s) => vis.get(s))).toEqual(
				ARMOR_SLOTS.map(() => false),
			);
		});

		it(`${shape} rig: nothing equipped keeps the skin base visible`, () => {
			const root = build();
			applyPartVisibility(root, new Set());
			const vis = visibilityBySlot(root);
			expect(SKIN_SLOTS.map((s) => vis.get(s))).toEqual(
				SKIN_SLOTS.map(() => true),
			);
		});

		it(`${shape} rig: equipping a piece reveals its own slots`, () => {
			const piece = ARMOR_PIECES.find((p) =>
				p.slots.some((s) => !BODY_BASE.has(s)),
			)!;
			const root = build();
			applyPartVisibility(root, new Set([piece.id]));
			const vis = visibilityBySlot(root);
			for (const s of piece.slots)
				if (!BODY_BASE.has(s)) expect(vis.get(s)).toBe(true);
		});

		it(`${shape} rig: the hide override wins over slot rules`, () => {
			const piece = ARMOR_PIECES.find((p) =>
				p.slots.some((s) => !BODY_BASE.has(s)),
			)!;
			const slot = piece.slots.find((s) => !BODY_BASE.has(s))!;
			const root = build();
			applyPartVisibility(root, new Set([piece.id]), new Set([slot]));
			expect(visibilityBySlot(root).get(slot)).toBe(false);
		});
	}

	it('resolves both rig shapes identically', () => {
		const dev = devScene();
		const packed = packedScene();
		applyPartVisibility(dev, new Set());
		applyPartVisibility(packed, new Set());
		expect([...visibilityBySlot(packed)]).toEqual([...visibilityBySlot(dev)]);
	});
});
