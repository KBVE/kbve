import * as THREE from 'three';
import { EntityPool } from '../mecs/pool';
import { Transform3 } from '../mecs/props';
import { FlameFx } from '../prop/components';
import { makeFlameMaterial } from './flameMaterial';
import { buildEmbers } from './emberParticles';

const WIDTH = 0.66;
const HEIGHT = 1;
const SPEED = 12;
const PLANES = 3;
const LOD = 9;
const HEAD_SCALE = 1.1 * 1.02;

interface FlameItem {
	outer: THREE.Group;
	inner: THREE.Group;
	mats: THREE.ShaderMaterial[];
	wp: THREE.Vector3;
	far: boolean;
}

// Pooled cross-quad flames keyed by FlameFx prop entities. Per frame it advances
// the shared time uniform and applies billboard LOD with hysteresis, matching the
// retired <Flame> component.
export class FlamePool extends EntityPool<FlameItem> {
	readonly root = new THREE.Group();
	private readonly geo = new THREE.PlaneGeometry(WIDTH, HEIGHT);

	constructor() {
		super([FlameFx, Transform3]);
	}

	protected create(eid: number): FlameItem {
		const dir = new THREE.Vector3(
			Transform3.dx[eid],
			Transform3.dy[eid],
			Transform3.dz[eid],
		).normalize();

		const outer = new THREE.Group();
		outer.position.set(
			Transform3.px[eid] + dir.x * HEAD_SCALE,
			Transform3.py[eid] + dir.y * HEAD_SCALE,
			Transform3.pz[eid] + dir.z * HEAD_SCALE,
		);

		const inner = new THREE.Group();
		inner.position.y = HEIGHT * 0.5;

		const mats: THREE.ShaderMaterial[] = [];
		for (let i = 0; i < PLANES; i++) {
			const m = makeFlameMaterial(FlameFx.seed[eid] + i * 3.713, SPEED);
			mats.push(m);
			const mesh = new THREE.Mesh(this.geo, m);
			mesh.rotation.y = (i / PLANES) * Math.PI;
			mesh.renderOrder = 10;
			inner.add(mesh);
		}
		// Embers ride the same shared uTime as the planes (tick advances it) and are
		// culled with them at LOD range by the child-visibility loop below.
		const embers = buildEmbers();
		mats.push(embers.mat);
		inner.add(embers.points);

		outer.add(inner);
		this.root.add(outer);
		return { outer, inner, mats, wp: new THREE.Vector3(), far: false };
	}

	protected destroy(item: FlameItem): void {
		this.root.remove(item.outer);
		for (const m of item.mats) m.dispose();
	}

	tick(time: number, camera: THREE.Camera): void {
		for (const [, it] of this.entries()) {
			for (const m of it.mats) m.uniforms.uTime.value = time;

			it.inner.getWorldPosition(it.wp);
			const dist = it.wp.distanceTo(camera.position);
			const nowFar = it.far ? dist > LOD - 0.75 : dist > LOD + 0.75;
			it.far = nowFar;

			if (nowFar) {
				it.inner.rotation.y = Math.atan2(
					camera.position.x - it.wp.x,
					camera.position.z - it.wp.z,
				);
			} else {
				it.inner.rotation.y = 0;
			}
			for (let i = 1; i < it.inner.children.length; i++) {
				it.inner.children[i].visible = !nowFar;
			}
		}
	}

	override dispose(): void {
		super.dispose();
		this.geo.dispose();
	}
}
