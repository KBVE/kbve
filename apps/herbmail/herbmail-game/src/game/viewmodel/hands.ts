import { slotOf } from './equipment';

export interface Hands {
	right: string | null;
	left: string | null;
}

// Map the set of held items onto the two hands. Main items own the right hand,
// off-hand items (shields) own the left. A light (torch) fills whichever hand is
// still free, preferring the right so it reads as the default carry, and yielding
// the right to a weapon when both are held. A light with no free hand is dropped.
export function resolveHands(held: readonly string[]): Hands {
	let main: string | null = null;
	let off: string | null = null;
	let light: string | null = null;
	for (const id of held) {
		const slot = slotOf(id);
		if (slot === 'main' && !main) main = id;
		else if (slot === 'off' && !off) off = id;
		else if (slot === 'light' && !light) light = id;
	}

	let right = main;
	let left = off;
	if (light) {
		if (!right) right = light;
		else if (!left) left = light;
	}
	return { right, left };
}
