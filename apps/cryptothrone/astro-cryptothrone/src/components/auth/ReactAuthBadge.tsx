import { useEffect, useRef, useState } from 'react';
import { useSession } from '@kbve/astro';
import { authBridge, initSupa } from '@/lib/supa';

export default function ReactAuthBadge() {
	const session = useSession();
	const [open, setOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		initSupa().catch(() => {});
	}, []);

	useEffect(() => {
		if (!open) return;
		const close = (e: MouseEvent) => {
			if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener('pointerdown', close);
		return () => document.removeEventListener('pointerdown', close);
	}, [open]);

	if (!session.ready) {
		return (
			<span
				className="h-7 w-7 animate-pulse rounded-full bg-white/10"
				aria-hidden="true"
			/>
		);
	}

	if (!session.authenticated) {
		return (
			<a
				href="/game/play/"
				className="rounded-full border border-amber-400/40 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-widest text-amber-300 no-underline transition hover:border-amber-300 hover:text-amber-200">
				Sign in
			</a>
		);
	}

	const display = session.username || session.name || 'adventurer';
	const initial = display.charAt(0).toUpperCase();

	return (
		<div ref={menuRef} className="relative">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="menu"
				aria-expanded={open}
				className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 transition hover:border-amber-400/40">
				{session.avatar ? (
					<img
						src={session.avatar}
						alt=""
						className="h-6 w-6 rounded-full object-cover"
					/>
				) : (
					<span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/80 text-xs font-bold text-black">
						{initial}
					</span>
				)}
				<span className="max-w-[8rem] truncate text-xs font-semibold text-stone-200">
					{display}
				</span>
			</button>
			{open && (
				<div
					role="menu"
					className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-black/90 shadow-xl shadow-black/50 backdrop-blur-xl">
					{session.username && (
						<a
							role="menuitem"
							href={`https://kbve.com/@${session.username}`}
							target="_blank"
							rel="noopener"
							className="block px-4 py-2.5 text-xs text-stone-300 no-underline transition hover:bg-white/5 hover:text-amber-200">
							View profile
						</a>
					)}
					<a
						role="menuitem"
						href="/game/play/"
						className="block px-4 py-2.5 text-xs text-stone-300 no-underline transition hover:bg-white/5 hover:text-amber-200">
						Enter the game
					</a>
					<button
						role="menuitem"
						type="button"
						onClick={async () => {
							setOpen(false);
							try {
								await authBridge.signOut();
							} finally {
								window.location.reload();
							}
						}}
						className="block w-full px-4 py-2.5 text-left text-xs text-red-300 transition hover:bg-red-500/10 hover:text-red-200">
						Sign out
					</button>
				</div>
			)}
		</div>
	);
}
