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
