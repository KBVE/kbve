import { useEffect } from 'react';
import { laserEvents } from '@kbve/laser';
import type { CharacterEventData, NotificationEventData } from '@kbve/laser';
import type { GameAction } from './game-store';
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
			laserEvents.on(
				'npc:interact' as keyof typeof laserEvents,
				((data: {
					npcId: string;
					npcName: string;
					actions: string[];
					coords: { x: number; y: number };
				}) => {
					dispatch({
						type: 'SET_NPC_INTERACTION',
						payload: data as any,
					});
				}) as any,
			),
		);

		unsubs.push(
			laserEvents.on(
				'player:damage' as keyof typeof laserEvents,
				((data: { damage: number }) => {
					dispatch({
						type: 'PLAYER_DAMAGE',
						payload: { damage: Number(data.damage) },
					});
				}) as any,
			),
		);

		unsubs.push(
			laserEvents.on(
				'player:stats' as keyof typeof laserEvents,
				((data: { stats: any }) => {
					dispatch({
						type: 'SET_PLAYER_STATS',
						payload: data.stats,
					});
				}) as any,
			),
		);

		unsubs.push(
			laserEvents.on(
				'dice:roll' as keyof typeof laserEvents,
				((data: {
					npcId: string;
					npcName: string;
					diceCount: number;
				}) => {
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
				}) as any,
			),
		);

		unsubs.push(
			laserEvents.on(
				'dice:result' as keyof typeof laserEvents,
				((data: { diceValues: number[] }) => {
					const total = data.diceValues.reduce(
						(a: number, b: number) => a + b,
						0,
					);
					dispatch({
						type: 'UPDATE_DICE_VALUES',
						payload: {
							diceValues: data.diceValues,
							totalRoll: total,
						},
					});
				}) as any,
			),
		);

		return () => unsubs.forEach((fn) => fn());
	}, [dispatch]);
}
