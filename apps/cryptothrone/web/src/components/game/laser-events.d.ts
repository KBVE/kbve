import type { BlackjackStateView, BjActionKind } from '@kbve/laser';
import type { PlayerStats } from './types';

declare module '@kbve/laser' {
	interface LaserEventMap {
		'blackjack:state': BlackjackStateView;
		'blackjack:open': { table_ref: string };
		'blackjack:close': void;
		'blackjack:bet': { amount: number };
		'blackjack:action': { kind: BjActionKind };
		'blackjack:insure': { amount: number };
		'blackjack:sfx': {
			kind:
				| 'card'
				| 'flip'
				| 'deal'
				| 'chip'
				| 'win'
				| 'blackjack'
				| 'lose'
				| 'push';
		};
		'blackjack:leave': void;
		'npc:interact': {
			npcId: string;
			npcName: string;
			actions: string[];
			coords: { x: number; y: number };
			eid?: number;
		};
		'shop:buy': { npc: number; itemRef: string; qty: number };
		'shop:sell': { npc: number; itemRef: string; qty: number };
		'shop:result': {
			action: 'buy' | 'sell';
			item_ref: string;
			qty: number;
			ok: boolean;
			reason: string;
			balance: number;
		};
		'player:damage': { damage: number };
		'player:stats': { stats: Partial<PlayerStats> };
		'monster:nearby': { count: number };
		'discord:participants': {
			participants: {
				id: string;
				name: string;
				avatarUrl: string | null;
				bot: boolean;
			}[];
		};
	}
}
