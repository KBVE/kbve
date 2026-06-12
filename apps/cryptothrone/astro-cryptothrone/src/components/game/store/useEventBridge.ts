import { useEffect } from 'react';
import { laserEvents } from '@kbve/laser';
import type { CharacterEventData, NotificationEventData } from '@kbve/laser';
import type { GameAction } from './game-store';
import type { NPCAction } from '../types';
import type { Dispatch } from 'react';

export function useEventBridge(dispatch: Dispatch<GameAction>) {
	useEffect(() => {
		const unsubs: (() => void)[] = [];

		unsubs.push(
			laserEvents.on('net:status', (data) => {
				const conn = data as {
					status:
						| 'connecting'
						| 'connected'
						| 'slow'
						| 'ready'
						| 'rejected'
						| 'error'
						| 'disconnected';
					detail?: string;
				};
				dispatch({ type: 'SET_CONNECTION', payload: conn });
			}),
		);

		unsubs.push(
			laserEvents.on('char:event', (data: CharacterEventData) => {
				dispatch({
					type: 'SET_MODAL',
					payload: {
						message: data.message,
						characterName: data.character_name,
						characterImage: data.character_image,
						backgroundImage: data.background_image,
					},
				});
			}),
		);

		unsubs.push(
			laserEvents.on('monster:nearby', (data) => {
				dispatch({
					type: 'ADD_NOTIFICATION',
					payload: {
						title: 'Danger',
						message:
							data.count > 1
								? `${data.count} monsters lurk nearby!`
								: 'A monster lurks nearby!',
						type: 'warning',
					},
				});
			}),
		);

		unsubs.push(
			laserEvents.on('notification', (data: NotificationEventData) => {
				const type =
					(data.notificationType as
						| 'info'
						| 'success'
						| 'danger'
						| 'warning') || 'info';
				dispatch({
					type: 'ADD_NOTIFICATION',
					payload: {
						title: data.title,
						message: data.message,
						type,
					},
				});
			}),
		);

		unsubs.push(
			laserEvents.on('npc:interact', (data) => {
				dispatch({
					type: 'SET_NPC_INTERACTION',
					payload: {
						npcId: data.npcId,
						npcName: data.npcName,
						actions: data.actions as NPCAction[],
						coords: data.coords,
					},
				});
			}),
		);

		unsubs.push(
			laserEvents.on('player:damage', (data) => {
				dispatch({
					type: 'PLAYER_DAMAGE',
					payload: { damage: Number(data.damage) },
				});
			}),
		);

		unsubs.push(
			laserEvents.on('player:stats', (data) => {
				dispatch({
					type: 'SET_PLAYER_STATS',
					payload: data.stats,
				});
			}),
		);

		unsubs.push(
			laserEvents.on('inventory:sync', (data) => {
				const sync = data as {
					items: { ref: string; count: number }[];
				};
				const itemIds = sync.items.flatMap((i) =>
					Array.from({ length: i.count }, () => i.ref),
				);
				dispatch({ type: 'SET_BACKPACK', payload: { itemIds } });
			}),
		);

		unsubs.push(
			laserEvents.on('item:pickup', (data) => {
				const pickup = data as { item_ref: string; count: number };
				dispatch({
					type: 'ADD_NOTIFICATION',
					payload: {
						title: 'Picked up',
						message:
							pickup.count > 1
								? `${pickup.item_ref} ×${pickup.count}`
								: pickup.item_ref,
						type: 'success',
					},
				});
			}),
		);

		unsubs.push(
			laserEvents.on('combat:event', (data) => {
				const combat = data as {
					target_ref: string | null;
					dmg: number;
					died: boolean;
				};
				const name = combat.target_ref ?? 'enemy';
				dispatch({
					type: 'ADD_NOTIFICATION',
					payload: {
						title: combat.died ? 'Defeated' : 'Combat',
						message: combat.died
							? `${name} slain!`
							: `Hit ${name} for ${combat.dmg}`,
						type: combat.died ? 'success' : 'info',
					},
				});
			}),
		);

		unsubs.push(
			laserEvents.on('item:used', (data) => {
				const used = data as { item_ref: string; heal: number };
				dispatch({
					type: 'ADD_NOTIFICATION',
					payload: {
						title: 'Used',
						message:
							used.heal > 0
								? `${used.item_ref} (+${used.heal} HP)`
								: used.item_ref,
						type: 'success',
					},
				});
			}),
		);

		unsubs.push(
			laserEvents.on('item:equipped', (data) => {
				const eq = data as {
					item_ref: string | null;
					slot?: 'weapon' | 'armor';
					attack: number;
					defense?: number;
				};
				dispatch({
					type: 'EQUIP_ITEM',
					payload: {
						slot: eq.slot === 'armor' ? 'offHand' : 'mainHand',
						itemId: eq.item_ref,
					},
				});
				dispatch({
					type: 'ADD_NOTIFICATION',
					payload: {
						title: eq.item_ref ? 'Equipped' : 'Unequipped',
						message: eq.item_ref
							? `${eq.item_ref} (atk ${eq.attack}, def ${eq.defense ?? 0})`
							: `atk ${eq.attack}, def ${eq.defense ?? 0}`,
						type: 'info',
					},
				});
			}),
		);

		unsubs.push(
			laserEvents.on('dice:roll', (data) => {
				dispatch({
					type: 'SET_DICE_ROLL',
					payload: {
						npcId: data.npcId,
						npcName: data.npcName,
						diceCount: data.diceCount,
						diceValues: [],
						totalRoll: null,
						phase: 'rolling',
					},
				});
			}),
		);

		unsubs.push(
			laserEvents.on('dice:result', (data) => {
				const total = data.diceValues.reduce((a, b) => a + b, 0);
				dispatch({
					type: 'UPDATE_DICE_VALUES',
					payload: {
						diceValues: data.diceValues,
						totalRoll: total,
					},
				});
			}),
		);

		return () => unsubs.forEach((fn) => fn());
	}, [dispatch]);
}
