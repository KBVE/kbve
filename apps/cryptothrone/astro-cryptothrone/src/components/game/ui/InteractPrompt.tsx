import { useEffect, useState } from 'react';
import { laserEvents } from '@kbve/laser';

export function InteractPrompt() {
	const [hint, setHint] = useState<string | null>(null);
	useEffect(() => {
		const off = laserEvents.on('interact:prompt', (data) => {
			setHint((data as { hint: string | null }).hint);
		});
		return off;
	}, []);
	if (!hint) return null;
	return (
		<div className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2">
			<div className="flex items-center gap-2 rounded-full border border-amber-200/20 bg-black/55 px-4 py-1.5 backdrop-blur-md">
				<kbd className="rounded border border-amber-200/40 bg-zinc-900 px-2 py-0.5 text-sm font-bold text-amber-200">
					E
				</kbd>
				<span className="text-sm text-amber-100">{hint}</span>
			</div>
		</div>
	);
}
