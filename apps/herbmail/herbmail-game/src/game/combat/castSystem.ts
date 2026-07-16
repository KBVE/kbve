import {
	Caster,
	CharState,
	Combat,
	Cooldowns,
	Health,
	Npc,
	Targetable,
	Transform3,
	each,
	hasComponent,
	type World,
} from '../mecs/props';
import { CastPhase, abilityBySlot, abilityById, type Ability } from './ability';
import { PlayerStats, spend } from '../character/playerStats';
import { playerEid } from '../character/playerEntity';
import { getTarget, dropTarget } from './targeting';
import { killGoblin } from '../npc/goblinSim';

interface Intent {
	eid: number;
	slot: number;
}

// Input -> sim bridge. Player keydown (and, later, network commands) push here;
// castSystem drains it once per frame so nothing outside the sim mutates cast
// state directly.
const intents: Intent[] = [];

export function requestCast(eid: number, slot: number): void {
	intents.push({ eid, slot });
}

const CD_FIELDS = ['s1', 's2', 's3', 's4'] as const;

export function cooldownRemaining(eid: number, slot: number): number {
	if (slot < 1 || slot > 4) return 0;
	return Cooldowns[CD_FIELDS[slot - 1]][eid] ?? 0;
}

function setCooldown(eid: number, slot: number, value: number): void {
	if (slot < 1 || slot > 4) return;
	Cooldowns[CD_FIELDS[slot - 1]][eid] = value;
}

// Only the player currently carries a mana pool; NPC casters (future) fall back
// to the cooldown gate alone.
function affordMp(eid: number, cost: number): boolean {
	if (cost <= 0) return true;
	if (eid !== playerEid()) return true;
	return PlayerStats.mp.value[PlayerStats.eid] >= cost;
}

function spendMp(eid: number, cost: number): void {
	if (cost <= 0 || eid !== playerEid()) return;
	spend(PlayerStats.mp, cost);
}

const CS_ATTACKING = 1 << 7;

function startCast(eid: number, ability: Ability): void {
	Caster.ability[eid] = ability.id;
	Caster.phase[eid] = CastPhase.Windup;
	Caster.t[eid] = 0;
	Caster.hasHit[eid] = 0;
	Caster.target[eid] = eid === playerEid() ? (getTarget() ?? -1) : -1;
	setCooldown(eid, ability.slot, ability.cooldown);
	spendMp(eid, ability.mpCost);
	CharState.bits[eid] |= CS_ATTACKING;
}

function tryStart(eid: number, slot: number): void {
	if (Caster.phase[eid] !== CastPhase.Idle) return;
	const ability = abilityBySlot(slot);
	if (!ability) return;
	if (cooldownRemaining(eid, slot) > 0) return;
	if (!affordMp(eid, ability.mpCost)) return;
	startCast(eid, ability);
}

function applyDamage(eid: number, ability: Ability, world: World): void {
	const cx = Transform3.px[eid];
	const cz = Transform3.pz[eid];
	let fx = Transform3.dx[eid];
	let fz = Transform3.dz[eid];
	const flen = Math.hypot(fx, fz) || 1;
	fx /= flen;
	fz /= flen;
	const cosHalf = Math.cos(ability.arc * 0.5);

	each(world, DAMAGE_TERMS, (t) => {
		if (t === eid) return;
		const dx = Transform3.px[t] - cx;
		const dz = Transform3.pz[t] - cz;
		const dist = Math.hypot(dx, dz);
		if (dist > ability.reach + Targetable.radius[t]) return;
		if (!ability.multiTarget && dist > 1e-3) {
			const dot = (fx * dx + fz * dz) / dist;
			if (dot < cosHalf) return;
		}
		const def = hasComponent(world, t, Combat) ? Combat.defense[t] : 0;
		Health.hp[t] -= Math.max(1, ability.damage - def);
		if (Health.hp[t] <= 0) killTarget(t, world);
	});
}

function killTarget(t: number, world: World): void {
	if (getTarget() === t) dropTarget();
	if (hasComponent(world, t, Npc)) killGoblin(world, t);
}

const DAMAGE_TERMS = [Targetable, Health, Transform3];
const CASTER_TERMS = [Caster];

// Advance every caster: tick cooldowns, drain queued intents, step the
// windup->active->recover phases, and resolve the hit once during Active.
export function castSystem(world: World, dt: number): void {
	each(world, CASTER_TERMS, (eid) => {
		for (const f of CD_FIELDS) {
			const v = Cooldowns[f][eid];
			if (v > 0) Cooldowns[f][eid] = Math.max(0, v - dt);
		}
	});

	for (const { eid, slot } of intents) tryStart(eid, slot);
	intents.length = 0;

	each(world, CASTER_TERMS, (eid) => {
		const phase = Caster.phase[eid];
		if (phase === CastPhase.Idle) return;
		const ability = abilityById(Caster.ability[eid]);
		if (!ability) {
			Caster.phase[eid] = CastPhase.Idle;
			return;
		}
		Caster.t[eid] += dt;
		const t = Caster.t[eid];
		const wEnd = ability.windup;
		const aEnd = wEnd + ability.active;
		const rEnd = aEnd + ability.recover;

		if (t >= wEnd && t < aEnd) {
			Caster.phase[eid] = CastPhase.Active;
			// Spread `hits` damage ticks across the active window so combo swings
			// each connect. hasHit counts ticks already applied this cast.
			const per = ability.active / ability.hits;
			const wanted = Math.min(
				ability.hits,
				Math.floor((t - wEnd) / per) + 1,
			);
			while (Caster.hasHit[eid] < wanted) {
				applyDamage(eid, ability, world);
				Caster.hasHit[eid]++;
			}
		} else if (t >= aEnd && t < rEnd) {
			Caster.phase[eid] = CastPhase.Recover;
		} else if (t >= rEnd) {
			Caster.phase[eid] = CastPhase.Idle;
			Caster.ability[eid] = -1;
			CharState.bits[eid] &= ~CS_ATTACKING;
		} else {
			Caster.phase[eid] = CastPhase.Windup;
		}
	});
}
