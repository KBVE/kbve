export const Action = {
	TogglePause: 0,
	Cancel: 1,
	Confirm: 2,
	MoveUp: 3,
	MoveDown: 4,
	MoveLeft: 5,
	MoveRight: 6,
	PrimaryAttack: 7,
	SecondaryAttack: 8,
	Dodge: 9,
	Block: 10,
	Ability1: 11,
	Ability2: 12,
	Ability3: 13,
	Ability4: 14,
	ToggleInventory: 15,
	ToggleMap: 16,
	ToggleCharacter: 17,
	ToggleQuestLog: 18,
	Interact: 19,
	Pickup: 20,
	ToggleChat: 21,
	Count: 22,
} as const;

export type ActionId = (typeof Action)[Exclude<keyof typeof Action, 'Count'>];

export const ACTION_COUNT = Action.Count;

export const ActionBehavior = {
	None: 0,
	Continuous: 1 << 0,
	AllowRepeat: 1 << 1,
	Global: 1 << 2,
	Consume: 1 << 3,
} as const;

export type ActionBehavior =
	(typeof ActionBehavior)[keyof typeof ActionBehavior];

export const ACTION_BEHAVIORS = new Uint8Array(ACTION_COUNT);

ACTION_BEHAVIORS[Action.TogglePause] =
	ActionBehavior.Global | ActionBehavior.Consume;

ACTION_BEHAVIORS[Action.MoveUp] = ActionBehavior.Continuous;

ACTION_BEHAVIORS[Action.MoveDown] = ActionBehavior.Continuous;

ACTION_BEHAVIORS[Action.MoveLeft] = ActionBehavior.Continuous;

ACTION_BEHAVIORS[Action.MoveRight] = ActionBehavior.Continuous;

export function hasActionBehavior(
	action: ActionId,
	behavior: ActionBehavior,
): boolean {
	return (ACTION_BEHAVIORS[action] & behavior) !== 0;
}
