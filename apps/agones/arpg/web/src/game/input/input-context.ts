import {
	ACTION_COUNT,
	Action,
	ActionBehavior,
	hasActionBehavior,
	type ActionId,
} from './actions';

export const InputContextId = {
	Gameplay: 0,
	Menu: 1,
	Placement: 2,
	Dialog: 3,
	Chat: 4,
} as const;

export type InputContextId =
	(typeof InputContextId)[keyof typeof InputContextId];

export class InputContextStack {
	private masks = new Map<InputContextId, Uint8Array>();
	private stack: InputContextId[] = [InputContextId.Gameplay];

	define(id: InputContextId, allowed: ActionId[]): void {
		const mask = new Uint8Array(ACTION_COUNT);
		for (const action of allowed) mask[action] = 1;
		this.masks.set(id, mask);
	}

	push(id: InputContextId): void {
		this.stack.push(id);
	}

	pop(id?: InputContextId): void {
		if (id === undefined) {
			if (this.stack.length > 1) this.stack.pop();
			return;
		}
		for (let i = this.stack.length - 1; i >= 1; i--) {
			if (this.stack[i] === id) {
				this.stack.splice(i, 1);
				return;
			}
		}
	}

	replace(id: InputContextId): void {
		this.stack = [id];
	}

	top(): InputContextId {
		return this.stack[this.stack.length - 1];
	}

	has(id: InputContextId): boolean {
		return this.stack.includes(id);
	}

	allows(action: ActionId): boolean {
		// Global actions (pause) fire regardless of which context owns input.
		if (hasActionBehavior(action, ActionBehavior.Global)) return true;
		const mask = this.masks.get(this.top());
		return mask ? mask[action] === 1 : true;
	}
}

const MOVE = [
	Action.MoveUp,
	Action.MoveDown,
	Action.MoveLeft,
	Action.MoveRight,
] as const;

const MENU_TOGGLES = [
	Action.ToggleInventory,
	Action.ToggleMap,
	Action.ToggleCharacter,
	Action.ToggleQuestLog,
] as const;

export function createDefaultContextStack(): InputContextStack {
	const stack = new InputContextStack();
	stack.define(InputContextId.Gameplay, [
		...MOVE,
		Action.PrimaryAttack,
		Action.SecondaryAttack,
		Action.Dodge,
		Action.Block,
		Action.Ability1,
		Action.Ability2,
		Action.Ability3,
		Action.Ability4,
		Action.Interact,
		Action.Pickup,
		Action.Confirm,
		Action.Cancel,
		Action.ToggleChat,
		...MENU_TOGGLES,
	]);
	stack.define(InputContextId.Menu, [
		Action.Confirm,
		Action.Cancel,
		...MENU_TOGGLES,
	]);
	stack.define(InputContextId.Placement, [
		...MOVE,
		Action.Confirm,
		Action.Cancel,
		Action.ToggleChat,
	]);
	stack.define(InputContextId.Dialog, [Action.Confirm, Action.Cancel]);
	// Chat-focused: only let the player close/confirm; MOVE + combat + a fresh
	// ToggleChat are gated, so typing can't move the character or fire, and the
	// focused DOM input owns the "/" key for close/insert.
	stack.define(InputContextId.Chat, [Action.Confirm, Action.Cancel]);
	return stack;
}
