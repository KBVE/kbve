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
		'monster:nearby': { count: number };
	}
}
