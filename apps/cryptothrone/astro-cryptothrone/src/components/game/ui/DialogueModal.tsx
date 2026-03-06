import { useState, useCallback } from 'react';
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
		<div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50">
			<div
				className="flex flex-col lg:flex-row bg-zinc-950 border border-yellow-500 shadow-sm rounded-xl bg-cover min-w-[700px] max-w-[900px] min-h-[400px]"
				style={{
					backgroundImage: node.backgroundImage
						? `url(${node.backgroundImage})`
						: undefined,
				}}>
				<div className="w-full lg:w-1/3 p-4 rounded-l-xl flex flex-col items-center justify-center relative">
					<h3 className="font-bold text-yellow-400 bg-zinc-950/80 rounded-2xl text-center mb-4 p-2">
						{npcName}
					</h3>
					{npcAvatar && (
						<img
							src={npcAvatar}
							alt={npcName}
							className="w-full h-auto rounded-md"
						/>
					)}
				</div>

				<div className="w-full lg:w-2/3 p-4 flex flex-col justify-between">
					<div className="flex justify-between items-center pb-3 border-b border-gray-700">
						<h3 className="font-bold text-yellow-400">
							{node.title || 'Dialogue'}
						</h3>
						<button
							onClick={handleClose}
							className="text-yellow-400 hover:bg-gray-100/10 rounded-full p-1 text-xl">
							&times;
						</button>
					</div>

					<div className="p-4 overflow-y-auto flex-1">
						<div className="flex flex-col gap-3">
							{hasPlayerResponse && (
								<div className="flex justify-end">
									<div className="w-3/4 text-yellow-400 bg-zinc-950/40 rounded-xl p-4 text-right">
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
								<div className="w-3/4 text-white bg-zinc-950/40 rounded-xl p-4">
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

					<div className="flex justify-end items-center gap-2 py-3 px-4 border-t border-gray-700">
						{npcTypingDone &&
							node.options?.map((option) => (
								<button
									key={option.id}
									onClick={() => handleOption(option)}
									className="px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-white rounded transition-all">
									{option.title}
								</button>
							))}
						<button
							onClick={handleClose}
							disabled={!npcTypingDone}
							className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-all disabled:opacity-50 disabled:pointer-events-none">
							{npcTypingDone
								? `Goodbye ${npcName}`
								: 'Speaking...'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
