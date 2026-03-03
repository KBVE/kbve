import { useState, useEffect, useCallback } from 'react';
import { laserEvents } from '@kbve/laser';
import type { CharacterEventData } from '@kbve/laser';

export function CharacterDialog() {
	const [dialog, setDialog] = useState<CharacterEventData | null>(null);

	const handleClose = useCallback(() => setDialog(null), []);

	useEffect(() => {
		const unsub = laserEvents.on('char:event', (data) => {
			setDialog(data);
		});
		return unsub;
	}, []);

	if (!dialog) return null;

	return (
		<div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 w-[700px] max-w-[90vw]">
			<div className="bg-gray-900/95 border border-gray-600 rounded-lg p-4 text-white flex gap-4">
				{dialog.character_image && (
					<img
						src={dialog.character_image}
						alt={dialog.character_name ?? 'NPC'}
						className="w-16 h-16 rounded-full object-cover flex-shrink-0"
					/>
				)}
				<div className="flex-1 min-w-0">
					{dialog.character_name && (
						<p className="font-bold text-yellow-300 text-sm mb-1">
							{dialog.character_name}
						</p>
					)}
					<p className="text-sm leading-relaxed">{dialog.message}</p>
				</div>
				<button
					onClick={handleClose}
					className="text-gray-400 hover:text-white text-xl leading-none flex-shrink-0"
					aria-label="Close dialog">
					&times;
				</button>
			</div>
		</div>
	);
}
