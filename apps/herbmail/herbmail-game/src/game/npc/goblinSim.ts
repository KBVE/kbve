import {
	CharState,
	Npc,
	Targetable,
	Transform3,
	Wander,
	addComponent,
	addEntity,
	applyStats,
	each,
	hasComponent,
	removeComponent,
	removeEntity,
	type World,
} from '../mecs/props';
import { CS } from '../character/charState';
import { makeMover, registerBody, type Body } from '../dungeon/collision';
import { playerAnchor } from '../render/playerAnchor';
import { sampleFlow, updateFlowField } from './flowField';

export const NPC_GOBLIN = 1;
export const NPC_KURENAI = 2;

interface NpcStats {
	hp: number;
	power: number;
	defense: number;
}
const NPC_STATS: Record<number, NpcStats> = {
	[NPC_GOBLIN]: { hp: 20, power: 4, defense: 0 },
	[NPC_KURENAI]: { hp: 60, power: 9, defense: 3 },
};

const DEATH_DUR = 1.6;
const CS_DEAD = CS.DEAD;

const WANDER_MIN = 1.5;
const WANDER_MAX = 4;
const IDLE_CHANCE = 0.35;

const AGGRO_COST = 7;
const DEAGGRO_COST = 11;
const BEELINE_COST = 2;

const APPROACH_DIST = 3.4;
const ORBIT_R = 2.1;
const RADIAL_GAIN = 1.1;
const TANGENT_FRAC = 0.75;
const ORBIT_FLIP_MIN = 2.5;
const ORBIT_FLIP_MAX = 6;

const VEL_SMOOTH = 5;

const SEP_RADIUS = 0.9;
const SEP_GAIN = 1.4;

interface NpcRuntime {
	body: Body;
	mover: (pos: { x: number; z: number }, dx: number, dz: number) => void;
	unreg: () => void;
	walkSpeed: number;
	chaseSpeed: number;
	aggro: boolean;
	orbitDir: number;
	orbitUntil: number;
	dyingRemaining: number;
}
const runtime = new Map<number, NpcRuntime>();

const NPC_TERMS = [Npc, Wander, Transform3];

export function spawnGoblin(
	world: World,
	x: number,
	z: number,
	radius: number,
	walkSpeed: number,
	chaseSpeed: number,
	kind: number = NPC_GOBLIN,
): number {
	const eid = addEntity(world);
	addComponent(world, eid, Transform3);
	addComponent(world, eid, Npc);
	addComponent(world, eid, Wander);
	Transform3.px[eid] = x;
	Transform3.py[eid] = 0;
	Transform3.pz[eid] = z;
	Npc.kind[eid] = kind;
	Npc.radius[eid] = radius;
	Wander.until[eid] = 0;
	const stats = NPC_STATS[kind] ?? NPC_STATS[NPC_GOBLIN];
	applyStats(world, eid, {
		hp: stats.hp,
		maxHp: stats.hp,
		power: stats.power,
		defense: stats.defense,
	});
	addComponent(world, eid, Targetable);
	Targetable.radius[eid] = radius;
	Targetable.priority[eid] = 1;
	addComponent(world, eid, CharState);
	CharState.bits[eid] = 0;
	const body = { pos: { x, z }, radius };
	runtime.set(eid, {
		body,
		mover: makeMover(radius, body, false, true),
		unreg: registerBody(body),
		walkSpeed,
		chaseSpeed,
		aggro: false,
		orbitDir: Math.random() < 0.5 ? 1 : -1,
		orbitUntil: 0,
		dyingRemaining: 0,
	});
	return eid;
}

export function despawnGoblin(world: World, eid: number): void {
	runtime.get(eid)?.unreg();
	runtime.delete(eid);
	removeEntity(world, eid);
}

// Death handoff: instead of removing the entity the instant HP hits zero, flag
// it dying so the puppet plays its death clip. AI freezes, the corpse stops
// being targetable, and npcSystem despawns it once DEATH_DUR elapses — then the
// React reconcile respawns a fresh one at the pool slot.
export function killGoblin(world: World, eid: number): void {
	const rt = runtime.get(eid);
	if (!rt || rt.dyingRemaining > 0) return;
	rt.dyingRemaining = DEATH_DUR;
	rt.aggro = false;
	Wander.vx[eid] = 0;
	Wander.vz[eid] = 0;
	CharState.bits[eid] |= CS_DEAD;
	if (hasComponent(world, eid, Targetable))
		removeComponent(world, eid, Targetable);
}

export function isDying(eid: number): boolean {
	return (runtime.get(eid)?.dyingRemaining ?? 0) > 0;
}

function separation(self: NpcRuntime, out: { x: number; z: number }): void {
	out.x = 0;
	out.z = 0;
	const p = self.body.pos;
	for (const other of runtime.values()) {
		if (other === self) continue;
		accumSep(p, other.body.pos.x, other.body.pos.z, out);
	}
	if (playerAnchor.on)
		accumSep(p, playerAnchor.pos.x, playerAnchor.pos.z, out);
}

function accumSep(
	p: { x: number; z: number },
	ox: number,
	oz: number,
	out: { x: number; z: number },
): void {
	const dx = p.x - ox;
	const dz = p.z - oz;
	const d2 = dx * dx + dz * dz;
	if (d2 >= SEP_RADIUS * SEP_RADIUS || d2 < 1e-6) return;
	const d = Math.sqrt(d2);
	const w = (1 - d / SEP_RADIUS) / d;
	out.x += dx * w;
	out.z += dz * w;
}

const sep = { x: 0, z: 0 };

const deadDrain: number[] = [];

export function npcSystem(world: World, t: number, dt: number): void {
	if (playerAnchor.on)
		updateFlowField(playerAnchor.pos.x, playerAnchor.pos.z);
	each(world, NPC_TERMS, (eid) => {
		const rt = runtime.get(eid);
		if (!rt) return;
		if (rt.dyingRemaining > 0) {
			rt.dyingRemaining -= dt;
			Wander.vx[eid] = 0;
			Wander.vz[eid] = 0;
			if (rt.dyingRemaining <= 0) deadDrain.push(eid);
			return;
		}
		const p = rt.body.pos;
		p.x = Transform3.px[eid];
		p.z = Transform3.pz[eid];

		const flow = playerAnchor.on ? sampleFlow(p.x, p.z) : null;
		if (rt.aggro) {
			if (!flow || flow.cost > DEAGGRO_COST) rt.aggro = false;
		} else if (flow && flow.cost <= AGGRO_COST) {
			rt.aggro = true;
			Wander.until[eid] = 0;
		}

		let vx: number;
		let vz: number;
		if (rt.aggro && flow) {
			const tx = playerAnchor.pos.x - p.x;
			const tz = playerAnchor.pos.z - p.z;
			const pd = Math.hypot(tx, tz);
			if (pd <= APPROACH_DIST) {
				if (t >= rt.orbitUntil) {
					rt.orbitUntil =
						t +
						ORBIT_FLIP_MIN +
						Math.random() * (ORBIT_FLIP_MAX - ORBIT_FLIP_MIN);
					if (Math.random() < 0.4) rt.orbitDir = -rt.orbitDir;
				}
				const nx = tx / Math.max(pd, 0.001);
				const nz = tz / Math.max(pd, 0.001);
				const radial = Math.max(
					-rt.walkSpeed,
					Math.min(rt.walkSpeed, (pd - ORBIT_R) * RADIAL_GAIN),
				);
				const tang = rt.walkSpeed * TANGENT_FRAC * rt.orbitDir;
				vx = nx * radial - nz * tang;
				vz = nz * radial + nx * tang;
			} else if (flow.cost <= BEELINE_COST) {
				vx = (tx / pd) * rt.chaseSpeed;
				vz = (tz / pd) * rt.chaseSpeed;
			} else {
				vx = flow.x * rt.chaseSpeed;
				vz = flow.z * rt.chaseSpeed;
			}
		} else {
			if (t >= Wander.until[eid]) {
				Wander.until[eid] =
					t + WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN);
				if (Math.random() < IDLE_CHANCE) {
					Wander.vx[eid] = 0;
					Wander.vz[eid] = 0;
				} else {
					const a = Math.random() * Math.PI * 2;
					Wander.vx[eid] = Math.sin(a) * rt.walkSpeed;
					Wander.vz[eid] = Math.cos(a) * rt.walkSpeed;
				}
			}
			vx = Wander.vx[eid];
			vz = Wander.vz[eid];
		}

		separation(rt, sep);
		if (sep.x !== 0 || sep.z !== 0) {
			const speed = rt.aggro ? rt.chaseSpeed : rt.walkSpeed;
			vx += sep.x * SEP_GAIN * speed;
			vz += sep.z * SEP_GAIN * speed;
			const len = Math.hypot(vx, vz);
			if (len > speed) {
				vx = (vx / len) * speed;
				vz = (vz / len) * speed;
			}
		}

		const k = 1 - Math.exp(-VEL_SMOOTH * dt);
		vx = Wander.vx[eid] + (vx - Wander.vx[eid]) * k;
		vz = Wander.vz[eid] + (vz - Wander.vz[eid]) * k;
		Wander.vx[eid] = vx;
		Wander.vz[eid] = vz;

		rt.mover(p, vx * dt, vz * dt);
		Transform3.px[eid] = p.x;
		Transform3.pz[eid] = p.z;
		if (vx !== 0 || vz !== 0) {
			Transform3.dx[eid] = vx;
			Transform3.dz[eid] = vz;
		}
	});
	if (deadDrain.length) {
		for (const eid of deadDrain) despawnGoblin(world, eid);
		deadDrain.length = 0;
	}
}
