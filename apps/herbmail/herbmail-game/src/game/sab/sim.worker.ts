// Authoritative dynamic-physics sim, off the main thread. Owns a Rapier world of
// break-off panels, a mecs (SAB) ECS world it is the sole structural writer of, the
// streamed static dungeon colliders, and a kinematic proxy of the main-thread
// player. Each fixed step it drives Rapier, copies body transforms into the shared
// mecs Transform component, then packs a dense AoS mat4 row per renderable into the
// instance buffer the renderer uploads zero-copy. Rapier WASM is inlined by
// rapier3d-compat (in-worker, no fetch).
import RAPIER from '@dimforge/rapier3d-compat';
import { createSabWorld, type SabWorld } from '@kbve/laser/mecs';
import { TILE, WALL_H } from '../config';
import { SOLID } from '../geometry/grid';
import {
	createGameWorld,
	createInstanceView,
	type GameWorld,
	type InstanceView,
	BODY_PANEL,
	F_RENDER,
	F_DYNAMIC,
	F_BREAKABLE,
	INST_COUNT,
	FLOATS_PER_INSTANCE,
} from '../mecs/schema';
import { PROPS_SCHEMA, PROPS_CAP } from '../mecs/propsSchema';
import { PROP_CRATE } from '../prop/kinds';

const FIXED_DT = 1 / 60;
const PLAYER_HALF = 0.6;
const PLAYER_RADIUS = 0.35;
const CRATE_HALF = 0.6;
const PANEL_THIN = 0.02;
const EXPLODE = 2.6;
const PANEL_TTL = 8;
const PANEL_FADE = 1.2;

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
	ecs: ArrayBufferLike;
	inst: ArrayBufferLike;
	player: ArrayBufferLike;
	props: ArrayBufferLike;
	ox: number;
	oz: number;
}

type PropsWorld = SabWorld<typeof PROPS_SCHEMA>;
interface SectorData {
	key: string;
	tiles: Uint8Array;
	cols: number;
	rows: number;
	originCol: number;
	originRow: number;
}

let ecs: GameWorld | null = null;
let instance: InstanceView | null = null;
let playerPose: Float32Array | null = null;
let props: PropsWorld | null = null;
let phys: RAPIER.World | null = null;
let playerBody: RAPIER.RigidBody | null = null;
let propStaticBody: RAPIER.RigidBody | null = null;
const bodyOf = new Map<number, RAPIER.RigidBody>();
const sectorBodies = new Map<string, RAPIER.RigidBody>();
// Prop colliders keyed by eid, tagged with the footprint they were built from.
// Streaming reuses eids (despawn+respawn in one synchronous rebuild), so identity
// is the footprint values, not the eid — a mismatch means the slot now holds a
// different prop and the collider must be rebuilt at the new spot.
interface PropRec {
	col: RAPIER.Collider;
	px: number;
	py: number;
	pz: number;
	hx: number;
	hz: number;
}
const propCollider = new Map<number, PropRec>();
const pending: SectorData[] = [];
// Reused per-frame scratch so the fixed-step loop allocates nothing steady-state.
const deadScratch: number[] = [];
const propCur = new Set<number>();
let acc = 0;
let last = 0;
let running = false;

// mat4 (column-major, THREE.Matrix4 element order) from a unit quaternion +
// translation + uniform scale. Local so the worker never imports three.
function composeMat4(
	out: Float32Array,
	base: number,
	tx: number,
	ty: number,
	tz: number,
	qx: number,
	qy: number,
	qz: number,
	qw: number,
	s: number,
): void {
	const x2 = qx + qx,
		y2 = qy + qy,
		z2 = qz + qz;
	const xx = qx * x2,
		xy = qx * y2,
		xz = qx * z2;
	const yy = qy * y2,
		yz = qy * z2,
		zz = qz * z2;
	const wx = qw * x2,
		wy = qw * y2,
		wz = qw * z2;
	out[base] = (1 - (yy + zz)) * s;
	out[base + 1] = (xy + wz) * s;
	out[base + 2] = (xz - wy) * s;
	out[base + 3] = 0;
	out[base + 4] = (xy - wz) * s;
	out[base + 5] = (1 - (xx + zz)) * s;
	out[base + 6] = (yz + wx) * s;
	out[base + 7] = 0;
	out[base + 8] = (xz + wy) * s;
	out[base + 9] = (yz - wx) * s;
	out[base + 10] = (1 - (xx + yy)) * s;
	out[base + 11] = 0;
	out[base + 12] = tx;
	out[base + 13] = ty;
	out[base + 14] = tz;
	out[base + 15] = 1;
}

// A crate was destroyed on the main thread -> spawn its six face panels as mecs
// entities flying outward + tumbling, each backed by a dynamic Rapier body.
function shatter(x: number, y: number, z: number): void {
	if (!phys || !ecs) return;
	const w = ecs;
	for (let f = 0; f < FACES.length; f++) {
		const eid = w.spawn();
		if (eid < 0) break;
		const { n, q } = FACES[f];
		const rb = phys.createRigidBody(
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
		phys.createCollider(
			RAPIER.ColliderDesc.cuboid(CRATE_HALF, CRATE_HALF, PANEL_THIN)
				.setFriction(0.8)
				.setRestitution(0.2),
			rb,
		);
		w.add(eid, 'Transform');
		w.add(eid, 'Body');
		w.add(eid, 'Flags');
		w.add(eid, 'Lifetime');
		w.stores.Body.kind[eid] = BODY_PANEL;
		w.stores.Flags.mask[eid] = F_RENDER | F_DYNAMIC | F_BREAKABLE;
		w.stores.Lifetime.age[eid] = 0;
		w.stores.Lifetime.ttl[eid] = PANEL_TTL;
		bodyOf.set(eid, rb);
	}
}

// Retire an entity: drop its Rapier body, forget the mapping, free the mecs slot.
function despawnBody(eid: number): void {
	const rb = bodyOf.get(eid);
	if (rb && phys) phys.removeRigidBody(rb);
	bodyOf.delete(eid);
	ecs?.despawn(eid);
}

// System: age every Lifetime entity, reap the expired. Query-driven — no per-kind
// special-casing; anything that carries Lifetime ages out the same way.
function sysLifetime(dt: number): void {
	if (!ecs) return;
	const L = ecs.stores.Lifetime;
	deadScratch.length = 0;
	for (const eid of ecs.query(['Lifetime'])) {
		L.age[eid] += dt;
		if (L.age[eid] >= L.ttl[eid]) deadScratch.push(eid);
	}
	for (const eid of deadScratch) despawnBody(eid);
}

// Reconcile static colliders for main-thread props (crates, stones — anything with
// a Collider footprint) by READING the shared props world zero-copy. New props get
// a box collider on the static body; despawned ones (broken crate, mined stone,
// streamed-out room) drop theirs. So dynamic panels land on and bounce off props,
// not just walls. Cross-thread mecs read in action.
function syncPropColliders(): void {
	if (!phys || !props || !propStaticBody) return;
	const T = props.stores.Transform3;
	const C = props.stores.Collider;
	const P = props.stores.Prop;
	propCur.clear();
	for (const eid of props.query(['Prop', 'Collider'])) {
		propCur.add(eid);
		const px = T.px[eid];
		const py = T.py[eid];
		const pz = T.pz[eid];
		const hx = C.hx[eid];
		const hz = C.hz[eid];
		const rec = propCollider.get(eid);
		if (
			rec &&
			rec.px === px &&
			rec.py === py &&
			rec.pz === pz &&
			rec.hx === hx &&
			rec.hz === hz
		) {
			continue;
		}
		if (rec) phys.removeCollider(rec.col, false);
		const hy = Math.max(hx, hz);
		// Crates use a centre-y transform (py = half-height); everything else (stones)
		// rests its base on py. Place the collider box to match the visible prop.
		const yc = P.kind[eid] === PROP_CRATE ? py : py + hy;
		const col = phys.createCollider(
			RAPIER.ColliderDesc.cuboid(hx, hy, hz)
				.setTranslation(px, yc, pz)
				.setFriction(0.9),
			propStaticBody,
		);
		propCollider.set(eid, { col, px, py, pz, hx, hz });
	}
	for (const [eid, rec] of propCollider) {
		if (propCur.has(eid)) continue;
		phys.removeCollider(rec.col, false);
		propCollider.delete(eid);
	}
}

function addSector(d: SectorData): void {
	if (!phys || sectorBodies.has(d.key)) return;
	// A malformed tile buffer would read `undefined & SOLID === 0` and silently drop
	// wall colliders (invisible non-solid walls). Reject it loudly instead.
	if (d.tiles.length !== d.cols * d.rows) {
		console.error('[sim] addSector: tile buffer size mismatch', d.key);
		return;
	}
	const body = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
	const hx = TILE / 2;
	const hy = WALL_H / 2;
	for (let r = 0; r < d.rows; r++) {
		for (let c = 0; c < d.cols; c++) {
			if (!(d.tiles[r * d.cols + c] & SOLID)) continue;
			phys.createCollider(
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
	if (!phys || !body) return;
	phys.removeRigidBody(body);
	sectorBodies.delete(key);
}

// Copy every simulated body's Rapier transform into the shared mecs Transform, then
// compact renderables into dense AoS mat4 rows for the instance buffer.
function syncAndPack(): void {
	if (!ecs || !instance) return;
	const w = ecs;
	const T = w.stores.Transform;
	const L = w.stores.Lifetime;
	const mats = instance.matrices;
	let count = 0;
	for (const eid of w.query(['Body'])) {
		const rb = bodyOf.get(eid);
		if (!rb) continue;
		const t = rb.translation();
		const q = rb.rotation();
		T.px[eid] = t.x;
		T.py[eid] = t.y;
		T.pz[eid] = t.z;
		T.qx[eid] = q.x;
		T.qy[eid] = q.y;
		T.qz[eid] = q.z;
		T.qw[eid] = q.w;
		let s = 1;
		if (w.has(eid, 'Lifetime')) {
			const left = L.ttl[eid] - L.age[eid];
			if (left < PANEL_FADE) s = left > 0 ? left / PANEL_FADE : 0;
		}
		composeMat4(
			mats,
			count * FLOATS_PER_INSTANCE,
			t.x,
			t.y,
			t.z,
			q.x,
			q.y,
			q.z,
			q.w,
			s,
		);
		count++;
	}
	instance.header[INST_COUNT] = count;
}

function loop(now: number): void {
	if (!phys || !ecs || !running) return;
	acc += Math.min(0.1, (now - last) / 1000);
	last = now;
	if (playerBody && playerPose) {
		playerBody.setNextKinematicTranslation({
			x: playerPose[0],
			y: playerPose[1] + PLAYER_HALF + PLAYER_RADIUS,
			z: playerPose[2],
		});
	}
	syncPropColliders();
	while (acc >= FIXED_DT) {
		phys.step();
		sysLifetime(FIXED_DT);
		acc -= FIXED_DT;
	}
	ecs.beginWrite();
	syncAndPack();
	ecs.step();
	ecs.endWrite();
	setTimeout(tick, 1000 / 60);
}

const tick = (): void => loop(performance.now());

async function init(d: InitData): Promise<void> {
	ecs = createGameWorld(d.ecs);
	instance = createInstanceView(d.inst);
	playerPose = new Float32Array(d.player);
	props = createSabWorld(d.props, PROPS_SCHEMA, PROPS_CAP);

	await RAPIER.init();
	phys = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

	const ground = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());
	phys.createCollider(
		RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, -0.5, 0),
		ground,
	);
	propStaticBody = phys.createRigidBody(RAPIER.RigidBodyDesc.fixed());

	playerBody = phys.createRigidBody(
		RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
			d.ox,
			PLAYER_HALF + PLAYER_RADIUS,
			d.oz,
		),
	);
	phys.createCollider(
		RAPIER.ColliderDesc.capsule(PLAYER_HALF, PLAYER_RADIUS),
		playerBody,
	);

	for (const s of pending) addSector(s);
	pending.length = 0;

	running = true;
	last = performance.now();
	loop(last);
}

globalThis.addEventListener('message', (e: MessageEvent) => {
	const d = e.data as { type: string } & Partial<InitData> &
		Partial<SectorData> & { x?: number; y?: number; z?: number };
	if (d.type === 'init' && d.ecs && d.inst && d.player && d.props) {
		void init(d as InitData);
	} else if (d.type === 'addSector' && d.tiles) {
		const s = d as SectorData;
		if (phys) addSector(s);
		else pending.push(s);
	} else if (d.type === 'removeSector' && d.key) {
		removeSector(d.key);
	} else if (d.type === 'shatter') {
		shatter(d.x ?? 0, d.y ?? 0, d.z ?? 0);
	} else if (d.type === 'stop') {
		running = false;
	}
});
