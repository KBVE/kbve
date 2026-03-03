import type {
	PlayerStats,
	PlayerInventory,
	NotificationItem,
	NPCInteractionState,
	DialogueState,
	DiceRollState,
	ModalState,
	EquipmentSlot,
} from '../types';

export interface GameState {
	player: {
		stats: PlayerStats;
		inventory: PlayerInventory;
	};
	settings: {
		isStatsCollapsed: boolean;
		isSettingsCollapsed: boolean;
		debugMode: boolean;
	};
	notifications: NotificationItem[];
	npcInteraction: NPCInteractionState | null;
	dialogue: DialogueState | null;
	diceRoll: DiceRollState | null;
	activeModal: ModalState | null;
}

export type GameAction =
	| { type: 'SET_PLAYER_STATS'; payload: Partial<PlayerStats> }
	| { type: 'ADD_ITEM'; payload: { itemId: string } }
	| { type: 'REMOVE_ITEM'; payload: { itemId: string } }
	| {
			type: 'EQUIP_ITEM';
			payload: { slot: EquipmentSlot; itemId: string | null };
	  }
	| { type: 'PLAYER_DAMAGE'; payload: { damage: number } }
	| {
			type: 'TOGGLE_SETTING';
			payload: { key: keyof GameState['settings'] };
	  }
	| {
			type: 'ADD_NOTIFICATION';
			payload: Omit<NotificationItem, 'id' | 'timestamp'>;
	  }
	| { type: 'REMOVE_NOTIFICATION'; payload: { id: number } }
	| { type: 'SET_NPC_INTERACTION'; payload: NPCInteractionState | null }
	| { type: 'SET_DIALOGUE'; payload: DialogueState | null }
	| { type: 'SET_DICE_ROLL'; payload: DiceRollState | null }
	| {
			type: 'UPDATE_DICE_VALUES';
			payload: { diceValues: number[]; totalRoll: number };
	  }
	| { type: 'SET_MODAL'; payload: ModalState | null };

const DEFAULT_EQUIPMENT: Record<EquipmentSlot, string | null> = {
	head: null,
	chest: null,
	legs: null,
	feet: null,
	mainHand: null,
	offHand: null,
	ring: null,
	amulet: null,
};

export const initialGameState: GameState = {
	player: {
		stats: {
			hp: 100,
			maxHp: 100,
			mp: 50,
			maxMp: 50,
			ep: 75,
			maxEp: 75,
			username: 'Guest',
		},
		inventory: {
			backpack: [],
			equipment: { ...DEFAULT_EQUIPMENT },
		},
	},
	settings: {
		isStatsCollapsed: false,
		isSettingsCollapsed: true,
		debugMode: false,
	},
	notifications: [],
	npcInteraction: null,
	dialogue: null,
	diceRoll: null,
	activeModal: null,
};

let notificationCounter = 0;

export function gameReducer(state: GameState, action: GameAction): GameState {
	switch (action.type) {
		case 'SET_PLAYER_STATS':
			return {
				...state,
				player: {
					...state.player,
					stats: { ...state.player.stats, ...action.payload },
				},
			};

		case 'PLAYER_DAMAGE': {
			const newHp = Math.max(
				0,
				state.player.stats.hp - action.payload.damage,
			);
			return {
				...state,
				player: {
					...state.player,
					stats: { ...state.player.stats, hp: newHp },
				},
			};
		}

		case 'ADD_ITEM':
			return {
				...state,
				player: {
					...state.player,
					inventory: {
						...state.player.inventory,
						backpack: [
							...state.player.inventory.backpack,
							action.payload.itemId,
						],
					},
				},
			};

		case 'REMOVE_ITEM':
			return {
				...state,
				player: {
					...state.player,
					inventory: {
						...state.player.inventory,
						backpack: state.player.inventory.backpack.filter(
							(id) => id !== action.payload.itemId,
						),
					},
				},
			};

		case 'EQUIP_ITEM':
			return {
				...state,
				player: {
					...state.player,
					inventory: {
						...state.player.inventory,
						equipment: {
							...state.player.inventory.equipment,
							[action.payload.slot]: action.payload.itemId,
						},
					},
				},
			};

		case 'TOGGLE_SETTING':
			return {
				...state,
				settings: {
					...state.settings,
					[action.payload.key]: !state.settings[action.payload.key],
				},
			};

		case 'ADD_NOTIFICATION': {
			const notification: NotificationItem = {
				...action.payload,
				id: ++notificationCounter,
				timestamp: Date.now(),
			};
			return {
				...state,
				notifications: [...state.notifications, notification],
			};
		}

		case 'REMOVE_NOTIFICATION':
			return {
				...state,
				notifications: state.notifications.filter(
					(n) => n.id !== action.payload.id,
				),
			};

		case 'SET_NPC_INTERACTION':
			return { ...state, npcInteraction: action.payload };

		case 'SET_DIALOGUE':
			return { ...state, dialogue: action.payload };

		case 'SET_DICE_ROLL':
			return { ...state, diceRoll: action.payload };

		case 'UPDATE_DICE_VALUES':
			if (!state.diceRoll) return state;
			return {
				...state,
				diceRoll: {
					...state.diceRoll,
					diceValues: action.payload.diceValues,
					totalRoll: action.payload.totalRoll,
					phase: 'result',
				},
			};

		case 'SET_MODAL':
			return { ...state, activeModal: action.payload };

		default:
			return state;
	}
}
