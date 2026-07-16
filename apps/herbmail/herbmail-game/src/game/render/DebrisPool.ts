import * as THREE from 'three';
import { hash01 } from '../geometry/rng';

const COUNT = 48;
const PER_BURST = 7;
const LIFE = 0.85;
const GRAVITY = -14;
const FRAG = 0.17;

interface Frag {
	mesh: THREE.Mesh;
	vx: number;
	vy: number;
	vz: number;
	wx: number;
	wy: number;
	wz: number;
	life: number;
}

// Transient wood-shard burst played when a crate breaks. Not an ECS entity — it
// is pure VFX with no room ownership — so it is a plain pooled ring: burst()
// claims PER_BURST fragments, tick() integrates ballistic motion + spin and
// shrinks each shard out over its life. A module singleton because the game runs
// a single canvas and the break handler needs it without prop drilling.
export class DebrisPool {
	readonly root = new THREE.Group();
	private readonly geo = new THREE.BoxGeometry(FRAG, FRAG, FRAG);
	private readonly mat = new THREE.MeshStandardMaterial({
		color: 0x6b4a2b,
		roughness: 1,
	});
	private readonly frags: Frag[] = [];
	private cursor = 0;
	private seed = 1;

	constructor() {
		for (let i = 0; i < COUNT; i++) {
			const mesh = new THREE.Mesh(this.geo, this.mat);
			mesh.visible = false;
			this.root.add(mesh);
			this.frags.push({
				mesh,
				vx: 0,
				vy: 0,
				vz: 0,
				wx: 0,
				wy: 0,
				wz: 0,
				life: 0,
			});
		}
	}

	burst(pos: [number, number, number], count: number = PER_BURST): void {
		const base = this.seed++;
		for (let i = 0; i < count; i++) {
			const f = this.frags[this.cursor];
			this.cursor = (this.cursor + 1) % COUNT;

			const a = hash01(base, i, 0x1b) * Math.PI * 2;
			const speed = 2.2 + hash01(base, i, 0x2c) * 2.6;
			const up = 3 + hash01(base, i, 0x3d) * 3.5;

			f.mesh.position.set(
				pos[0] + (hash01(base, i, 0x4e) - 0.5) * 0.4,
				pos[1] + (hash01(base, i, 0x5f) - 0.5) * 0.4,
				pos[2] + (hash01(base, i, 0x60) - 0.5) * 0.4,
			);
			f.mesh.rotation.set(
				hash01(base, i, 0x71) * 6.28,
				hash01(base, i, 0x82) * 6.28,
				hash01(base, i, 0x93) * 6.28,
			);
			f.mesh.scale.setScalar(1);
			f.mesh.visible = true;
			f.vx = Math.cos(a) * speed;
			f.vz = Math.sin(a) * speed;
			f.vy = up;
			f.wx = (hash01(base, i, 0xa4) - 0.5) * 18;
			f.wy = (hash01(base, i, 0xb5) - 0.5) * 18;
			f.wz = (hash01(base, i, 0xc6) - 0.5) * 18;
			f.life = LIFE;
		}
	}

	tick(dt: number): void {
		const d = Math.min(dt, 0.05);
		for (const f of this.frags) {
			if (f.life <= 0) continue;
			f.life -= d;
			if (f.life <= 0) {
				f.mesh.visible = false;
				continue;
			}
			f.vy += GRAVITY * d;
			f.mesh.position.x += f.vx * d;
			f.mesh.position.y += f.vy * d;
			f.mesh.position.z += f.vz * d;
			f.mesh.rotation.x += f.wx * d;
			f.mesh.rotation.y += f.wy * d;
			f.mesh.rotation.z += f.wz * d;
			f.mesh.scale.setScalar(Math.min(1, f.life / (LIFE * 0.5)));
		}
	}

	dispose(): void {
		this.geo.dispose();
		this.mat.dispose();
	}
}

let singleton: DebrisPool | null = null;

export function getDebrisPool(): DebrisPool {
	if (!singleton) singleton = new DebrisPool();
	return singleton;
}
