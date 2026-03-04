import { useGameStore } from '../store/GameStoreContext';

export function CharacterDialog() {
	const { state, dispatch } = useGameStore();
	const modal = state.activeModal;

	if (!modal) return null;

	const handleClose = () => dispatch({ type: 'SET_MODAL', payload: null });

	return (
		<div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50">
			<div
				className="flex flex-col lg:flex-row bg-zinc-950 border border-yellow-500 shadow-sm rounded-xl bg-cover min-w-[700px] max-w-[900px] min-h-[400px]"
				style={{
					backgroundImage: modal.backgroundImage
						? `url(${modal.backgroundImage})`
						: undefined,
				}}>
				<div className="w-full lg:w-1/3 p-4 rounded-l-xl flex flex-col items-center justify-center relative">
					<h3 className="font-bold text-yellow-400 bg-zinc-950/80 rounded-2xl text-center mb-4 p-2">
						{modal.characterName || 'NPC'}
					</h3>
					{modal.characterImage && (
						<img
							src={modal.characterImage}
							alt={modal.characterName || 'NPC'}
							className="w-full h-auto rounded-md"
						/>
					)}
				</div>
				<div className="w-full lg:w-2/3 p-4 flex flex-col justify-between">
					<div className="flex justify-end">
						<button
							onClick={handleClose}
							className="text-yellow-400 hover:bg-gray-100/10 rounded-full p-1 text-xl">
							&times;
						</button>
					</div>
					<div className="p-4 overflow-y-auto flex-1">
						<p className="text-yellow-400 bg-zinc-950/80 rounded-xl p-4">
							{modal.message}
						</p>
					</div>
					<div className="flex justify-end py-3 px-4 border-t border-gray-700">
						<button
							onClick={handleClose}
							className="px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-white rounded transition-all">
							Okay
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
