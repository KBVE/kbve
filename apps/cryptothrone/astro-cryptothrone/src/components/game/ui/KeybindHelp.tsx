import { useEffect, useState } from 'react';

const BINDS: [string, string][] = [
	['Arrows', 'Move'],
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
		<div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
			<div className="w-64 rounded-xl border border-amber-200/15 bg-black/80 p-5 backdrop-blur-xl">
				<h3 className="mb-3 text-center text-sm font-bold text-amber-300">
					Controls
				</h3>
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
				<button
					type="button"
					onClick={() => setOpen(false)}
					className="mt-4 w-full rounded-lg bg-amber-500/90 py-1.5 text-xs font-semibold text-black hover:bg-amber-400">
					Close
				</button>
			</div>
		</div>
	);
}
