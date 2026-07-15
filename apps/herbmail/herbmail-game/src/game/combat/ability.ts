// Static ability definitions — shared, read-only data for every caster (player
// and, later, NPCs). Only cast STATE lives per-entity in the Caster/Cooldowns
// ECS components; this table is never duplicated. Slot 0 is the basic LMB
// attack, slots 1-4 are the number-key specials.

export const enum CastPhase {
	Idle = 0,
	Windup = 1,
	Active = 2,
	Recover = 3,
}

export interface Ability {
	id: number;
	slot: number;
	name: string;
	icon: string;
	clip: string;
	mpCost: number;
	cooldown: number;
	// Phase durations (seconds). windup = anticipation, active = the hit window
	// (damage resolves here, synced to the swing), recover = follow-through.
	windup: number;
	active: number;
	recover: number;
	// Hit shape: reach in world units ahead of the caster, arc = full cone angle
	// (radians) the target must fall within unless multiTarget sweeps all around.
	reach: number;
	arc: number;
	multiTarget: boolean;
	// Motion: lunge = forward impulse (m/s) on the windup->active edge; dash
	// closes distance to the locked target during windup.
	lunge: number;
	dash: boolean;
	damage: number;
	// Placeholder for a future stagger/interrupt on the victim (0 = none).
	stagger: number;
}

export const BASIC_ID = 0;
export const ABILITY_SLOTS = 4;

export const ABILITIES: Ability[] = [
	{
		id: 0,
		slot: 0,
		name: 'Strike',
		icon: '🗡️',
		clip: 'Sword_Attack',
		mpCost: 0,
		cooldown: 0,
		windup: 0.12,
		active: 0.18,
		recover: 0.2,
		reach: 2.2,
		arc: 1.4,
		multiTarget: false,
		lunge: 2.5,
		dash: false,
		damage: 5,
		stagger: 0,
	},
	{
		id: 1,
		slot: 1,
		name: 'Heavy Strike',
		icon: '⚔️',
		clip: 'Sword_Attack_RM',
		mpCost: 8,
		cooldown: 5,
		windup: 0.28,
		active: 0.22,
		recover: 0.35,
		reach: 2.6,
		arc: 1.1,
		multiTarget: false,
		lunge: 4,
		dash: false,
		damage: 14,
		stagger: 1,
	},
	{
		id: 2,
		slot: 2,
		name: 'Cleave',
		icon: '🌀',
		clip: 'Melee_Hook',
		mpCost: 10,
		cooldown: 7,
		windup: 0.2,
		active: 0.25,
		recover: 0.3,
		reach: 2.4,
		arc: Math.PI,
		multiTarget: true,
		lunge: 0,
		dash: false,
		damage: 9,
		stagger: 0,
	},
	{
		id: 3,
		slot: 3,
		name: 'Dash Strike',
		icon: '💨',
		clip: 'Sword_Attack_RM',
		mpCost: 9,
		cooldown: 6,
		windup: 0.18,
		active: 0.2,
		recover: 0.3,
		reach: 2.8,
		arc: 1.0,
		multiTarget: false,
		lunge: 3,
		dash: true,
		damage: 11,
		stagger: 0,
	},
	{
		id: 4,
		slot: 4,
		name: 'Bash',
		icon: '🔨',
		clip: 'Sword_Attack_Standing',
		mpCost: 6,
		cooldown: 4,
		windup: 0.1,
		active: 0.15,
		recover: 0.25,
		reach: 2.0,
		arc: 1.4,
		multiTarget: false,
		lunge: 1.5,
		dash: false,
		damage: 6,
		stagger: 1,
	},
];

export const SPECIALS: Ability[] = ABILITIES.filter((a) => a.slot > 0);

export function abilityById(id: number): Ability | undefined {
	return ABILITIES[id];
}

export function abilityBySlot(slot: number): Ability | undefined {
	return ABILITIES.find((a) => a.slot === slot);
}

export function castDuration(a: Ability): number {
	return a.windup + a.active + a.recover;
}
