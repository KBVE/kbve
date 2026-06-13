import { FloatingWindow } from '@kbve/astro';
import { useGameSelector, useGameDispatch } from '../store/GameStoreContext';

export function CharacterDialog() {
	const modal = useGameSelector((s) => s.activeModal);
	const dispatch = useGameDispatch();

	if (!modal) return null;

	const handleClose = () => dispatch({ type: 'SET_MODAL', payload: null });

	return (
		<FloatingWindow
			storageKey="ct-character-dialog"
			initial={{
				x:
					typeof window !== 'undefined'
						? Math.max(12, (window.innerWidth - 640) / 2)
						: 120,
				y:
					typeof window !== 'undefined'
						? Math.max(12, (window.innerHeight - 420) / 3)
						: 80,
			}}
			size={{ width: 640, height: 420 }}
			minWidth={380}
			minHeight={260}
			title={modal.characterName || 'NPC'}
			onClose={handleClose}>
			<div
				className="flex h-full flex-col bg-zinc-950 bg-cover lg:flex-row"
				style={{
					backgroundImage: modal.backgroundImage
						? `url(${modal.backgroundImage})`
						: undefined,
				}}>
				<div className="flex w-full flex-col items-center justify-center p-4 lg:w-1/3">
					{modal.characterImage && (
						<img
							src={modal.characterImage}
							alt={modal.characterName || 'NPC'}
							className="h-auto w-full rounded-md"
						/>
					)}
				</div>
				<div className="flex w-full flex-col lg:w-2/3">
					<div className="flex-1 overflow-y-auto p-4">
						<p className="rounded-xl bg-zinc-950/80 p-4 text-yellow-400">
							{modal.message}
						</p>
					</div>
					<div className="flex justify-end border-t border-gray-700 px-4 py-3">
						<button
							onClick={handleClose}
							className="rounded bg-yellow-500 px-5 py-2 text-white transition-all hover:bg-yellow-400">
							Okay
						</button>
					</div>
				</div>
			</div>
		</FloatingWindow>
	);
}
