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

const swingSubs = new Set<() => void>();
const hitSubs = new Set<(c: Contact) => void>();

/** Fire when an attack starts; the melee hook runs a swing from here. */
export function triggerSwing(): void {
	for (const f of swingSubs) f();
}

export function subscribeSwing(f: () => void): () => void {
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
