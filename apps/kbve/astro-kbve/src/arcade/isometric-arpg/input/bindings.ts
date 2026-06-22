import { Action, type ActionId } from './actions';

export type KeyCode =
	| 'ArrowUp'
	| 'ArrowDown'
	| 'ArrowLeft'
	| 'ArrowRight'
	| 'KeyW'
	| 'KeyS'
	| 'KeyA'
	| 'KeyD'
	| 'Space'
	| 'KeyE'
	| 'KeyF'
	| 'KeyR'
	| 'KeyI'
	| 'KeyM'
	| 'KeyC'
	| 'KeyL'
	| 'Escape'
	| 'Enter';

export type KeyBindings = Readonly<Partial<Record<KeyCode, ActionId>>>;

export const DEFAULT_KEY_BINDINGS = {
	ArrowUp: Action.MoveUp,
	ArrowDown: Action.MoveDown,
	ArrowLeft: Action.MoveLeft,
	ArrowRight: Action.MoveRight,

	KeyW: Action.MoveUp,
	KeyS: Action.MoveDown,
	KeyA: Action.MoveLeft,
	KeyD: Action.MoveRight,

	Space: Action.PrimaryAttack,
	KeyE: Action.Interact,
	KeyF: Action.Pickup,
	KeyR: Action.Dodge,

	KeyI: Action.ToggleInventory,
	KeyM: Action.ToggleMap,
	KeyC: Action.ToggleCharacter,
	KeyL: Action.ToggleQuestLog,

	Escape: Action.Cancel,
	Enter: Action.Confirm,
} as const satisfies KeyBindings;

export interface GamepadBindings {
	readonly buttons: ReadonlyArray<ActionId | undefined>;
	readonly axes: {
		readonly moveX: number;
		readonly moveY: number;
	};
	readonly deadzone: number;
}

export const DEFAULT_GAMEPAD_BINDINGS = {
	buttons: [
		Action.Confirm,
		Action.Cancel,
		Action.SecondaryAttack,
		Action.Interact,
		Action.Block,
		Action.PrimaryAttack,
		undefined,
		Action.Dodge,
		undefined,
		Action.TogglePause,
		undefined,
		undefined,
		Action.MoveUp,
		Action.MoveDown,
		Action.MoveLeft,
		Action.MoveRight,
	],
	axes: {
		moveX: 0,
		moveY: 1,
	},
	deadzone: 0.25,
} as const satisfies GamepadBindings;
