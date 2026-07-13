import { Prop } from '../mecs/props';

export interface Contact {
	point: [number, number, number];
	kind: 'wall' | 'target';
	object?: object;
}

export const SWING = {
	// seconds into the swing the blade is "live" for contact
	hotStart: 0.06,
	hotEnd: 0.42,
	samples: 7,
	// reach past the visual blade tip so slightly-far targets connect.
	hitReach: 0.35,
	// forward velocity impulse on attack -> gait becomes 'walk' so the legs
	// actually step (Walk_Loop) while the masked swing plays over them. This is
	// the step-in reach WITHOUT foot-slide (legs move with the body).
	stepSpeed: 3.2,
};

export interface SwingSource {
	fistBone?: string;
	reach?: number;
}

const swingSubs = new Set<(s: SwingSource) => void>();
const hitSubs = new Set<(c: Contact) => void>();

/** Fire when an attack starts; the melee hook runs a swing from here. */
export function triggerSwing(source: SwingSource = {}): void {
	for (const f of swingSubs) f(source);
}

export function subscribeSwing(f: (s: SwingSource) => void): () => void {
	swingSubs.add(f);
	return () => swingSubs.delete(f);
}

export function onContact(f: (c: Contact) => void): () => void {
	hitSubs.add(f);
	return () => hitSubs.delete(f);
}

export function emitContact(c: Contact): void {
	for (const f of hitSubs) f(c);
}

/**
 * Subscribe to melee contacts that hit a prop of a specific kind, resolving the
 * hitbox object's ECS eid and filtering by Prop.kind. The callback gets a validated
 * eid — the shared contact→eid→kind dance for breakable props.
 */
export function onPropContact(
	kind: number,
	fn: (eid: number) => void,
): () => void {
	return onContact((c) => {
		if (c.kind !== 'target' || !c.object) return;
		const eid = (c.object as { userData: { eid?: number } }).userData.eid;
		if (eid === undefined || Prop.kind[eid] !== kind) return;
		fn(eid);
	});
}
