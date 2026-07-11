// Authoritative dynamic-physics sim, off the main thread. Owns a Rapier world of
// crates + break-off panels (the ECS-in-worker), streamed static colliders for the
// mounted dungeon, and a kinematic proxy of the main-thread player. Each fixed step
// it writes body transforms + kind into the shared Float32 block; the renderer reads
// it zero-copy. Rapier WASM is inlined by rapier3d-compat (in-worker, no fetch).
import RAPIER from '@dimforge/rapier3d-compat';
import { TILE, WALL_H } from '../config';
import { SOLID } from '../geometry/grid';
import {
	STATE_TICK,
	STATE_RUNNING,
	STATE_BODY_COUNT,
	STATE_READY,
	FLOATS_PER_BODY,
	MAX_BODIES,
} from './layout';

const FIXED_DT = 1 / 60;
const PLAYER_HALF = 0.6;
const PLAYER_RADIUS = 0.35;
const CRATE_HALF = 0.6;
const PANEL_THIN = 0.02;
const EXPLODE = 2.6;

// KIND written into transform slot 7 (0 none, 2 panel — crate stays a main-thread
// ECS prop; only its break-off panels are simulated here).
const KIND_NONE = 0;
const KIND_PANEL = 2;

// Six crate faces: outward normal + quaternion rotating a thin-Z panel to face it.
const FACES: {
	n: [number, number, number];
	q: [number, number, number, number];
}[] = [
	{ n: [0, 0, 1], q: [0, 0, 0, 1] },
	{ n: [0, 0, -1], q: [0, 1, 0, 0] },
	{ n: [1, 0, 0], q: [0, 0.7071, 0, 0.7071] },
	{ n: [-1, 0, 0], q: [0, -0.7071, 0, 0.7071] },
	{ n: [0, 1, 0], q: [-0.7071, 0, 0, 0.7071] },
	{ n: [0, -1, 0], q: [0.7071, 0, 0, 0.7071] },
];

interface InitData {
	control: ArrayBufferLike;
	xform: ArrayBufferLike;
	player: ArrayBufferLike;
	ox: number;
	oz: number;
}
interface SectorData {
	key: string;
	tiles: Uint8Array;
	cols: number;
	rows: number;
	originCol: number;
	originRow: number;
}

let state: Int32Array | null = null;
let xform: Float32Array | null = null;
let playerPose: Float32Array | null = null;
let world: RAPIER.World | null = null;
let playerBody: RAPIER.RigidBody | null = null;
const slots: (RAPIER.RigidBody | null)[] = new Array(MAX_BODIES).fill(null);
const kinds: number[] = new Array(MAX_BODIES).fill(KIND_NONE);
const sectorBodies = new Map<string, RAPIER.RigidBody>();
const pending: SectorData[] = [];
let acc = 0;
let last = 0;

function allocSlot(): number {
	for (let i = 0; i < MAX_BODIES; i++) if (!slots[i]) return i;
	return -1;
}

// A crate was destroyed on the main thread -> spawn its six face panels flying
// outward + tumbling from the crate centre.
function shatter(x: number, y: number, z: number): void {
	if (!world) return;
	for (let f = 0; f < FACES.length; f++) {
		const s = allocSlot();
		if (s < 0) break;
		const { n, q } = FACES[f];
		const rb = world.createRigidBody(
			RAPIER.RigidBodyDesc.dynamic()
				.setTranslation(
					x + n[0] * CRATE_HALF,
					y + n[1] * CRATE_HALF,
					z + n[2] * CRATE_HALF,
				)
				.setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] })
				.setLinvel(n[0] * EXPLODE, n[1] * EXPLODE + 1.5, n[2] * EXPLODE)
				.setAngvel({ x: n[1] + n[2], y: n[0] + n[2], z: n[0] - n[1] })
				.setCcdEnabled(true),
		);
		world.createCollider(
			RAPIER.ColliderDesc.cuboid(CRATE_HALF, CRATE_HALF, PANEL_THIN)
				.setFriction(0.8)
				.setRestitution(0.2),
			rb,
		);
		slots[s] = rb;
		kinds[s] = KIND_PANEL;
	}
}

function addSector(d: SectorData): void {
	if (!world || sectorBodies.has(d.key)) return;
	const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
	const hx = TILE / 2;
	const hy = WALL_H / 2;
	for (let r = 0; r < d.rows; r++) {
		for (let c = 0; c < d.cols; c++) {
			if (!(d.tiles[r * d.cols + c] & SOLID)) continue;
			world.createCollider(
				RAPIER.ColliderDesc.cuboid(hx, hy, hx).setTranslation(
					(d.originCol + c + 0.5) * TILE,
					hy,
					(d.originRow + r + 0.5) * TILE,
				),
				body,
			);
		}
	}
	sectorBodies.set(d.key, body);
}

function removeSector(key: string): void {
	const body = sectorBodies.get(key);
	if (!world || !body) return;
	world.removeRigidBody(body);
	sectorBodies.delete(key);
}

function writeTransforms(): void {
	if (!xform) return;
	for (let i = 0; i < MAX_BODIES; i++) {
		const b = i * FLOATS_PER_BODY;
		const rb = slots[i];
		if (!rb) {
			xform[b + 7] = KIND_NONE;
			continue;
		}
		const t = rb.translation();
		const q = rb.rotation();
		xform[b] = t.x;
		xform[b + 1] = t.y;
		xform[b + 2] = t.z;
		xform[b + 3] = q.x;
		xform[b + 4] = q.y;
		xform[b + 5] = q.z;
		xform[b + 6] = q.w;
		xform[b + 7] = kinds[i];
	}
}

function loop(now: number): void {
	if (!world || !state || Atomics.load(state, STATE_RUNNING) === 0) return;
	acc += Math.min(0.1, (now - last) / 1000);
	last = now;
	if (playerBody && playerPose) {
		playerBody.setNextKinematicTranslation({
			x: playerPose[0],
			y: playerPose[1] + PLAYER_HALF + PLAYER_RADIUS,
			z: playerPose[2],
		});
	}
	while (acc >= FIXED_DT) {
		world.step();
		acc -= FIXED_DT;
	}
	writeTransforms();
	Atomics.add(state, STATE_TICK, 1);
	setTimeout(() => loop(performance.now()), 1000 / 60);
}

async function init(d: InitData): Promise<void> {
	state = new Int32Array(d.control);
	xform = new Float32Array(d.xform);
	playerPose = new Float32Array(d.player);

	await RAPIER.init();
	world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

	const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
	world.createCollider(
		RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, -0.5, 0),
		ground,
	);

	playerBody = world.createRigidBody(
		RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
			d.ox,
			PLAYER_HALF + PLAYER_RADIUS,
			d.oz,
		),
	);
	world.createCollider(
		RAPIER.ColliderDesc.capsule(PLAYER_HALF, PLAYER_RADIUS),
		playerBody,
	);

	for (const s of pending) addSector(s);
	pending.length = 0;

	Atomics.store(state, STATE_BODY_COUNT, MAX_BODIES);
	Atomics.store(state, STATE_RUNNING, 1);
	Atomics.store(state, STATE_READY, 1);
	last = performance.now();
	loop(last);
}

// eslint-disable-next-line no-restricted-globals
self.onmessage = (e: MessageEvent) => {
	const d = e.data as { type: string } & Partial<InitData> &
		Partial<SectorData> & { x?: number; y?: number; z?: number };
	if (d.type === 'init' && d.control && d.xform && d.player) {
		void init(d as InitData);
	} else if (d.type === 'addSector' && d.tiles) {
		const s = d as SectorData;
		if (world) addSector(s);
		else pending.push(s);
	} else if (d.type === 'removeSector' && d.key) {
		removeSector(d.key);
	} else if (d.type === 'shatter') {
		shatter(d.x ?? 0, d.y ?? 0, d.z ?? 0);
	} else if (d.type === 'stop' && state) {
		Atomics.store(state, STATE_RUNNING, 0);
	}
};
