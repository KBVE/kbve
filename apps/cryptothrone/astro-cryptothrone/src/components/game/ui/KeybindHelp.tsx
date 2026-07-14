import { useEffect, useState } from 'react';
import { FloatingWindow } from '@kbve/astro/ui';

const BINDS: [string, string][] = [
	['Arrows / WASD', 'Move'],
	['Click', 'Move / interact'],
	['Space', 'Attack adjacent'],
	['1–4', 'Use consumable'],
	['Enter', 'Chat'],
	['?', 'Toggle this help'],
];

export function KeybindHelp() {
	const [open, setOpen] = useState(false);
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const active = document.activeElement;
			if (
				active instanceof HTMLInputElement ||
				active instanceof HTMLTextAreaElement
			)
				return;
			if (e.key === '?') setOpen((v) => !v);
			if (e.key === 'Escape') setOpen(false);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);
	if (!open) return null;
	return (
		<FloatingWindow
			storageKey="ct-controls-window"
			layer="modal"
			initial={{
				x:
					typeof window !== 'undefined'
						? Math.max(12, (window.innerWidth - 288) / 2)
						: 200,
				y:
					typeof window !== 'undefined'
						? Math.max(12, (window.innerHeight - 300) / 3)
						: 100,
			}}
			size={{ width: 288, height: 300 }}
			resizable={false}
			title="Controls"
			onClose={() => setOpen(false)}>
			<div className="p-4">
				<ul className="space-y-1.5">
					{BINDS.map(([k, v]) => (
						<li
							key={k}
							className="flex justify-between text-xs text-stone-300">
							<kbd className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.65rem]">
								{k}
							</kbd>
							<span>{v}</span>
						</li>
					))}
				</ul>
			</div>
		</FloatingWindow>
	);
}
