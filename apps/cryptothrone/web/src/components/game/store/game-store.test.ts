import { describe, it, expect } from 'vitest';
import {
	gameReducer,
	initialGameState,
	type GameState,
	type GameAction,
} from './game-store';

const base = (): GameState =>
	JSON.parse(JSON.stringify(initialGameState)) as GameState;

describe('gameReducer', () => {
	it('SET_PLAYER_STATS merges partial stats', () => {
		const s = gameReducer(base(), {
			type: 'SET_PLAYER_STATS',
			payload: { hp: 42, username: 'Knight' },
		});
		expect(s.player.stats.hp).toBe(42);
		expect(s.player.stats.username).toBe('Knight');
		expect(s.player.stats.mp).toBe(initialGameState.player.stats.mp);
	});

	it('PLAYER_DAMAGE clamps hp at zero', () => {
		const s = gameReducer(base(), {
			type: 'PLAYER_DAMAGE',
			payload: { damage: 9999 },
		});
		expect(s.player.stats.hp).toBe(0);
	});

	it('PLAYER_DAMAGE subtracts within range', () => {
		const s = gameReducer(base(), {
			type: 'PLAYER_DAMAGE',
			payload: { damage: 30 },
		});
		expect(s.player.stats.hp).toBe(70);
	});

	it('ADD_ITEM then REMOVE_ITEM round-trips the backpack', () => {
		let s = gameReducer(base(), {
			type: 'ADD_ITEM',
			payload: { itemId: 'iron-sword' },
		});
		s = gameReducer(s, {
			type: 'ADD_ITEM',
			payload: { itemId: 'blue-shark' },
		});
		expect(s.player.inventory.backpack).toEqual([
			'iron-sword',
			'blue-shark',
		]);
		s = gameReducer(s, {
			type: 'REMOVE_ITEM',
			payload: { itemId: 'iron-sword' },
		});
		expect(s.player.inventory.backpack).toEqual(['blue-shark']);
	});

	it('EQUIP_ITEM sets and clears a slot', () => {
		let s = gameReducer(base(), {
			type: 'EQUIP_ITEM',
			payload: { slot: 'mainHand', itemId: 'iron-sword' },
		});
		expect(s.player.inventory.equipment.mainHand).toBe('iron-sword');
		s = gameReducer(s, {
			type: 'EQUIP_ITEM',
			payload: { slot: 'mainHand', itemId: null },
		});
		expect(s.player.inventory.equipment.mainHand).toBeNull();
	});

	it('TOGGLE_SETTING flips a boolean key', () => {
		const s = gameReducer(base(), {
			type: 'TOGGLE_SETTING',
			payload: { key: 'debugMode' },
		});
		expect(s.settings.debugMode).toBe(true);
	});

	it('ADD_NOTIFICATION assigns an id + timestamp, REMOVE drops it', () => {
		let s = gameReducer(base(), {
			type: 'ADD_NOTIFICATION',
			payload: { title: 'Hi', message: 'there', type: 'info' },
		});
		expect(s.notifications).toHaveLength(1);
		const id = s.notifications[0].id;
		expect(s.notifications[0].timestamp).toBeGreaterThan(0);
		s = gameReducer(s, {
			type: 'REMOVE_NOTIFICATION',
			payload: { id },
		});
		expect(s.notifications).toHaveLength(0);
	});

	it('SET_NPC_INTERACTION / SET_DIALOGUE / SET_MODAL set their slices', () => {
		const npc = {
			npcId: 'n',
			npcName: 'N',
			actions: [],
			coords: { x: 0, y: 0 },
		};
		expect(
			gameReducer(base(), {
				type: 'SET_NPC_INTERACTION',
				payload: npc,
			}).npcInteraction,
		).toEqual(npc);
		expect(
			gameReducer(base(), { type: 'SET_MODAL', payload: null })
				.activeModal,
		).toBeNull();
	});

	it('UPDATE_DICE_VALUES is a no-op without an active roll', () => {
		const s = gameReducer(base(), {
			type: 'UPDATE_DICE_VALUES',
			payload: { diceValues: [1, 2], totalRoll: 3 },
		});
		expect(s.diceRoll).toBeNull();
	});

	it('UPDATE_DICE_VALUES resolves an active roll to the result phase', () => {
		let s = gameReducer(base(), {
			type: 'SET_DICE_ROLL',
			payload: {
				npcId: 'n',
				npcName: 'N',
				diceCount: 2,
				diceValues: [0, 0],
				totalRoll: null,
				phase: 'rolling',
			},
		});
		s = gameReducer(s, {
			type: 'UPDATE_DICE_VALUES',
			payload: { diceValues: [4, 5], totalRoll: 9 },
		});
		expect(s.diceRoll?.phase).toBe('result');
		expect(s.diceRoll?.totalRoll).toBe(9);
	});

	it('unknown action returns the same state reference', () => {
		const start = base();
		const s = gameReducer(start, {
			type: 'NOPE',
		} as unknown as GameAction);
		expect(s).toBe(start);
	});
});

describe('SET_CONNECTION', () => {
	it('replaces the connection state', () => {
		const next = gameReducer(initialGameState, {
			type: 'SET_CONNECTION',
			payload: { status: 'rejected', detail: 'match full' },
		});
		expect(next.connection).toEqual({
			status: 'rejected',
			detail: 'match full',
		});
		expect(initialGameState.connection.status).toBe('connecting');
	});
});
