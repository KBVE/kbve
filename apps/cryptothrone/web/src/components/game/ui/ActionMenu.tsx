import { useState, useRef, useEffect, useCallback } from 'react';
import { useGameSelector, useGameDispatch } from '../store/GameStoreContext';
import {
	getNPCById,
	getNpcDbEntry,
	getDialogueById,
	getGreetingDialogueId,
} from '../data/npcs';
import { getItemById, getItemPrice } from '../data/items';
import type { NPCAction, TradeShopItem } from '../types';
import { PixelPanel } from './PixelPanel';

export function ActionMenu() {
	const npc = useGameSelector((s) => s.npcInteraction);
	const dispatch = useGameDispatch();
	const menuRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState({ x: 0, y: 0 });

	const clampPosition = useCallback((x: number, y: number) => {
		const padding = 10;
		const el = menuRef.current;
		if (!el) return { x, y };

		const rect = el.getBoundingClientRect();
		let nx = x;
		let ny = y;

		if (nx + rect.width > window.innerWidth - padding)
			nx = window.innerWidth - rect.width - padding;
		if (ny + rect.height > window.innerHeight - padding)
			ny = window.innerHeight - rect.height - padding;
		if (nx < padding) nx = padding;
		if (ny < padding) ny = padding;

		return { x: nx, y: ny };
	}, []);

	useEffect(() => {
		if (npc) {
			setTimeout(() => {
				setPosition(clampPosition(npc.coords.x, npc.coords.y));
			}, 0);
		}
	}, [npc, clampPosition]);

	const handleClose = () => {
		dispatch({ type: 'SET_NPC_INTERACTION', payload: null });
	};

	const handleAction = (action: NPCAction) => {
		if (!npc) return;

		switch (action) {
			case 'talk': {
				const npcData = getNPCById(npc.npcId);
				if (!npcData) break;
				const dialogue = getDialogueById(
					getGreetingDialogueId(npc.npcId),
				);
				if (dialogue) {
					dispatch({
						type: 'SET_DIALOGUE',
						payload: {
							npcId: npc.npcId,
							npcName: npcData.name,
							npcAvatar: npcData.avatar,
							dialogue,
						},
					});
				}
				break;
			}
			case 'steal':
				dispatch({
					type: 'SET_DICE_ROLL',
					payload: {
						npcId: npc.npcId,
						npcName: npc.npcName,
						diceCount: 4,
						diceValues: [0, 0, 0, 0],
						totalRoll: null,
						phase: 'rolling',
					},
				});
				break;
			case 'trade': {
				const ref = npc.npcId.replace(/^npc_/, '');
				const entry = getNpcDbEntry(ref);
				const refs = entry?.shop_items ?? [];
				if (npc.eid == null || refs.length === 0) {
					dispatch({
						type: 'ADD_NOTIFICATION',
						payload: {
							title: 'Trade',
							message: `${npc.npcName} has nothing to trade right now.`,
							type: 'info',
						},
					});
					break;
				}
				const shopItems: TradeShopItem[] = refs.map((r) => ({
					ref: r,
					name: getItemById(r)?.name ?? r,
					buyPrice: getItemPrice(r).buy,
				}));
				dispatch({
					type: 'SET_TRADE',
					payload: {
						npcId: npc.npcId,
						npcName: npc.npcName,
						npcEid: npc.eid,
						shopItems,
					},
				});
				break;
			}
			case 'inspect':
				dispatch({
					type: 'ADD_NOTIFICATION',
					payload: {
						title: 'Inspect',
						message: `You observe ${npc.npcName} carefully...`,
						type: 'info',
					},
				});
				break;
		}

		handleClose();
	};

	if (!npc) return null;

	return (
		<PixelPanel
			ref={menuRef}
			className="fixed z-[100] min-w-[10rem] p-2 text-white"
			style={{ left: `${position.x}px`, top: `${position.y}px` }}
			slice={8}
			scale={2}>
			<div className="flex justify-between items-center mb-2">
				<h3 className="font-bold text-sm text-white">{npc.npcName}</h3>
				<button
					onClick={handleClose}
					className="text-xs font-bold m-1 text-yellow-300 border rounded-full px-1 hover:text-yellow-500 hover:scale-110">
					X
				</button>
			</div>
			{npc.actions.map((action) => (
				<button
					key={action}
					onClick={() => handleAction(action)}
					className="block w-full text-sm py-1 px-2 mb-1 bg-yellow-500 hover:bg-yellow-400 rounded capitalize">
					{action}
				</button>
			))}
			<button
				onClick={handleClose}
				className="block w-full text-xs py-1 px-2 mt-2 bg-red-500 hover:bg-red-600 rounded text-white">
				Close
			</button>
		</PixelPanel>
	);
}
