import type { PlayerStats } from './types';

declare module '@kbve/laser' {
	interface LaserEventMap {
		'npc:interact': {
			npcId: string;
			npcName: string;
			actions: string[];
			coords: { x: number; y: number };
		};
		'player:damage': { damage: number };
		'player:stats': { stats: PlayerStats };
		'dice:roll': { npcId: string; npcName: string; diceCount: number };
		'dice:result': { diceValues: number[] };
		'monster:nearby': {
			count: number;
			nearestEid: number;
			distance: number;
		};
	}
}
