import { useState, useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../store/GameStoreContext';
import { getNPCById, getDialogueById } from '../data/npcs';
import type { NPCAction } from '../types';

export function ActionMenu() {
	const { state, dispatch } = useGameStore();
	const npc = state.npcInteraction;
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
				const dialogueId =
					npc.npcId === 'npc_barkeep'
						? 'dlg_barkeep_greeting'
						: 'dlg_monk_greeting';
				const dialogue = getDialogueById(dialogueId);
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
			case 'trade':
				dispatch({
					type: 'ADD_NOTIFICATION',
					payload: {
						title: 'Trade',
						message: `${npc.npcName} has nothing to trade right now.`,
						type: 'info',
					},
				});
				break;
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
		<div
			ref={menuRef}
			className="fixed bg-zinc-900 border border-yellow-300 rounded-md p-2 z-[100]"
			style={{ left: `${position.x}px`, top: `${position.y}px` }}>
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
		</div>
	);
}
