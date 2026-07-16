import { Prop } from '../mecs/props';

export interface Contact {
	point: [number, number, number];
	kind: 'wall' | 'target';
	object?: object;
}

export const SWING = {
	hotStart: 0.06,
	hotEnd: 0.42,
	samples: 7,

	hitReach: 0.35,

	stepSpeed: 3.2,
};

export interface SwingSource {
	fistBone?: string;
	reach?: number;
}

const swingSubs = new Set<(s: SwingSource) => void>();
const hitSubs = new Set<(c: Contact) => void>();

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
