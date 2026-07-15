import {
	addComponent,
	addEntity,
	createWorld,
	Caster,
	CharState,
	Cooldowns,
	HeldItems,
	Transform3,
} from '../mecs/props';
import { CS } from './charState';
import { equipmentById } from '../viewmodel/equipment';
import { getHands, subscribeHeld } from '../viewmodel/store';

const HELD_CODES = ['', 'sword', 'torch', 'crate', 'flashlight'];

export function heldCode(id: string | null): number {
	const i = id ? HELD_CODES.indexOf(id) : 0;
	return i < 0 ? 0 : i;
}

export function heldId(code: number): string | null {
	return HELD_CODES[code] || null;
}

const world = createWorld();
let eid = -1;

export function playerEid(): number {
	if (eid < 0) {
		eid = addEntity(world);
		addComponent(world, eid, Transform3);
		addComponent(world, eid, CharState);
		addComponent(world, eid, HeldItems);
		addComponent(world, eid, Caster);
		addComponent(world, eid, Cooldowns);
		Caster.ability[eid] = -1;
		Caster.phase[eid] = 0;
		syncHands();
	}
	return eid;
}

export function playerBits(): number {
	return eid < 0 ? 0 : CharState.bits[eid];
}

export function writePlayerBits(clear: number, set: number): void {
	const e = playerEid();
	CharState.bits[e] = (CharState.bits[e] & ~clear) | set;
}

const EQUIP_BITS = CS.HAS_WEAPON | CS.HAS_SHIELD | CS.HAS_LIGHT;

function syncHands(): void {
	if (eid < 0) return;
	const hands = getHands();
	HeldItems.right[eid] = heldCode(hands.right);
	HeldItems.left[eid] = heldCode(hands.left);
	let bits = 0;
	for (const id of [hands.right, hands.left]) {
		if (!id) continue;
		const kind = equipmentById(id).kind;
		if (kind === 'weapon') bits |= CS.HAS_WEAPON;
		else if (kind === 'shield') bits |= CS.HAS_SHIELD;
		else if (equipmentById(id).slot === 'light') bits |= CS.HAS_LIGHT;
	}
	writePlayerBits(EQUIP_BITS, bits);
}

subscribeHeld(syncHands);
