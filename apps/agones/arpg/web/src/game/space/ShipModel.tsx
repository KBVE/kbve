import { useMemo, type ReactElement } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { arpgAsset } from '../config';

/**
 * The starfighter that flies in the 3D space modes — the same model the iso sprites
 * bake from (fighter1 + idolknight skin), served from public assets. Shared by the
 * free-roam <SpaceScene> and the on-rails <RailScene>. Points +Z (forward).
 *
 * Source model lives in apps/agones/arpg/web/scripts/ship-src (kbve-model-sprites
 * bakes the iso sheets from it).
 */
const SHIP_MODEL_URL = arpgAsset(
	'/assets/arcade/arpg/models/ship/fighter1.obj',
);
const SHIP_SKIN_URL = arpgAsset(
	'/assets/arcade/arpg/models/ship/idolknight.jpg',
);

const SHIP_LENGTH = 3.2; // target longest-axis size in scene units (the old fuselage was 2.4)

// The bbox auto-align below maps the hull's longest axis → +Z (nose/forward) and its
// thinnest axis → +Y (up). That removes the "lying on a wing" problem for any model,
// but a bbox can't tell nose-from-tail or top-from-bottom — so flip these two if the
// ship flies tail-first or upside-down after a model swap.
const FLIP_FORWARD = false;
const FLIP_UP = false;

/** Rotation that lays the hull flat: longest bbox axis → +Z, thinnest → +Y, wing → X. */
function alignMatrix(size: THREE.Vector3): THREE.Matrix4 {
	const axes = [
		{ v: size.x, dir: new THREE.Vector3(1, 0, 0) },
		{ v: size.y, dir: new THREE.Vector3(0, 1, 0) },
		{ v: size.z, dir: new THREE.Vector3(0, 0, 1) },
	];
	const fwd = axes.reduce((a, b) => (b.v > a.v ? b : a)); // longest = nose
	const up = axes.reduce((a, b) => (b.v < a.v ? b : a)); // thinnest = up
	const f = fwd.dir.clone().multiplyScalar(FLIP_FORWARD ? -1 : 1);
	const u = up.dir.clone().multiplyScalar(FLIP_UP ? -1 : 1);
	const right = new THREE.Vector3().crossVectors(u, f).normalize(); // X = up × forward
	const upO = new THREE.Vector3().crossVectors(f, right).normalize(); // re-orthogonalize
	// basis(right,upO,f) maps world→model; its transpose (orthonormal inverse) maps model→world.
	return new THREE.Matrix4().makeBasis(right, upO, f).transpose();
}

/** Loads + axis-aligns + normalizes the fighter model. Nose +Z, deck +Y, centered. */
export function ShipModel(): ReactElement {
	const obj = useLoader(OBJLoader, SHIP_MODEL_URL);
	const skin = useLoader(THREE.TextureLoader, SHIP_SKIN_URL);

	const model = useMemo(() => {
		skin.colorSpace = THREE.SRGBColorSpace;
		const root = obj.clone(true);
		// align principal axes (baked into geometry so center/scale stay rotation-free).
		const align = alignMatrix(
			new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()),
		);
		root.traverse((c) => {
			const m = c as THREE.Mesh;
			if (!m.isMesh) return;
			m.castShadow = true;
			m.geometry = m.geometry.clone();
			m.geometry.applyMatrix4(align);
			// emissive-leaning so the hull reads bright like the baked sprites + the
			// old primitive engine glow, while diffuse keeps the form shaded.
			m.material = new THREE.MeshStandardMaterial({
				map: skin,
				emissive: new THREE.Color('#2a3a52'),
				emissiveIntensity: 0.45,
				metalness: 0.45,
				roughness: 0.5,
			});
		});
		// center on origin + normalize the longest axis to SHIP_LENGTH so swapping the
		// model never changes the flight scale.
		const box = new THREE.Box3().setFromObject(root);
		const size = box.getSize(new THREE.Vector3());
		const center = box.getCenter(new THREE.Vector3());
		const s = SHIP_LENGTH / (Math.max(size.x, size.y, size.z) || 1);
		root.scale.setScalar(s);
		root.position.copy(center).multiplyScalar(-s);
		const wrap = new THREE.Group();
		wrap.add(root);
		return wrap;
	}, [obj, skin]);

	return <primitive object={model} />;
}
