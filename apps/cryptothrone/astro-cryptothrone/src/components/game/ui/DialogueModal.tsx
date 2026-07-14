import { useState, useCallback } from 'react';
import { FloatingWindow } from '@kbve/astro/ui';
import { useGameSelector, useGameDispatch } from '../store/GameStoreContext';
import { getDialogueById } from '../data/npcs';
import { TypewriterText } from './TypewriterText';
import type { DialogueOption } from '../types';

export function DialogueModal() {
	const dialogue = useGameSelector((s) => s.dialogue);
	const dispatch = useGameDispatch();

	const [playerTypingDone, setPlayerTypingDone] = useState(false);
	const [npcTypingDone, setNpcTypingDone] = useState(false);

	const handlePlayerComplete = useCallback(
		() => setPlayerTypingDone(true),
		[],
	);
	const handleNpcComplete = useCallback(() => setNpcTypingDone(true), []);

	const handleClose = () => {
		dispatch({ type: 'SET_DIALOGUE', payload: null });
		setPlayerTypingDone(false);
		setNpcTypingDone(false);
	};

	const handleOption = (option: DialogueOption) => {
		const nextDialogue = getDialogueById(option.nextDialogueId);
		if (nextDialogue && dialogue) {
			dispatch({
				type: 'SET_DIALOGUE',
				payload: {
					npcId: dialogue.npcId,
					npcName: dialogue.npcName,
					npcAvatar: dialogue.npcAvatar,
					dialogue: nextDialogue,
				},
			});
			setPlayerTypingDone(false);
			setNpcTypingDone(false);
		}
	};

	if (!dialogue) return null;

	const { npcName, npcAvatar, dialogue: node } = dialogue;
	const hasPlayerResponse = !!node.playerResponse;
	const showNpcText = hasPlayerResponse ? playerTypingDone : true;

	return (
		<FloatingWindow
			storageKey="ct-dialogue-window"
			initial={{
				x:
					typeof window !== 'undefined'
						? Math.max(12, (window.innerWidth - 720) / 2)
						: 120,
				y:
					typeof window !== 'undefined'
						? Math.max(12, (window.innerHeight - 460) / 3)
						: 80,
			}}
			size={{ width: 720, height: 460 }}
			minWidth={420}
			minHeight={300}
			title={npcName}
			onClose={handleClose}>
			<div
				className="flex h-full flex-col bg-zinc-950 bg-cover lg:flex-row"
				style={{
					backgroundImage: node.backgroundImage
						? `url(${node.backgroundImage})`
						: undefined,
				}}>
				<div className="flex w-full flex-col items-center justify-center p-4 lg:w-1/3">
					{npcAvatar && (
						<img
							src={npcAvatar}
							alt={npcName}
							className="h-auto w-full rounded-md"
						/>
					)}
				</div>

				<div className="flex w-full flex-col lg:w-2/3">
					{node.title && (
						<div className="border-b border-gray-700 px-4 py-2 text-sm font-bold text-yellow-400">
							{node.title}
						</div>
					)}

					<div className="flex-1 overflow-y-auto p-4">
						<div className="flex flex-col gap-3">
							{hasPlayerResponse && (
								<div className="flex justify-end">
									<div className="w-3/4 rounded-xl bg-zinc-950/40 p-4 text-right text-yellow-400">
										{!playerTypingDone ? (
											<TypewriterText
												text={node.playerResponse!}
												onComplete={
													handlePlayerComplete
												}
											/>
										) : (
											node.playerResponse
										)}
									</div>
								</div>
							)}

							{showNpcText && (
								<div className="w-3/4 rounded-xl bg-zinc-950/40 p-4 text-white">
									{!npcTypingDone ? (
										<TypewriterText
											text={node.message}
											onComplete={handleNpcComplete}
										/>
									) : (
										node.message
									)}
								</div>
							)}
						</div>
					</div>

					<div className="flex items-center justify-end gap-2 border-t border-gray-700 px-4 py-3">
						{npcTypingDone &&
							node.options?.map((option) => (
								<button
									key={option.id}
									onClick={() => handleOption(option)}
									className="rounded bg-yellow-500 px-5 py-2 text-white transition-all hover:bg-yellow-400">
									{option.title}
								</button>
							))}
						<button
							onClick={handleClose}
							disabled={!npcTypingDone}
							className="rounded bg-red-500 px-5 py-2 text-white transition-all hover:bg-red-600 disabled:pointer-events-none disabled:opacity-50">
							{npcTypingDone
								? `Goodbye ${npcName}`
								: 'Speaking...'}
						</button>
					</div>
				</div>
			</div>
		</FloatingWindow>
	);
}
