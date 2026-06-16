import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useAuth } from '../lib/auth';

const navLink =
	'text-zinc-300 transition hover:text-white [&.active]:text-quest-300';

/** True once the page is scrolled past a small threshold. */
function useScrolled(threshold = 12): boolean {
	const [scrolled, setScrolled] = useState(false);
	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > threshold);
		onScroll(); // sync on mount (e.g. restored scroll position)
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	}, [threshold]);
	return scrolled;
}

interface NavItem {
	to: '/gigs' | '/talent' | '/post';
	label: string;
}

export function NavBar() {
	const { user, signOut } = useAuth();
	const scrolled = useScrolled();
	const [open, setOpen] = useState(false);

	const items: NavItem[] = [
		{ to: '/gigs', label: 'Gigs' },
		{ to: '/talent', label: 'Talent' },
		...(user?.can_post
			? [{ to: '/post' as const, label: 'Post a gig' }]
			: []),
	];

	// Close on Escape + lock body scroll while the drawer is open.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) =>
			e.key === 'Escape' && setOpen(false);
		document.addEventListener('keydown', onKey);
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = prev;
		};
	}, [open]);

	return (
		<>
			<header
				className={`sticky top-0 z-30 transition-all duration-300 ${
					scrolled
						? 'border-b border-zinc-800/80 bg-zinc-950/80 shadow-lg shadow-black/40 backdrop-blur'
						: 'border-b border-transparent bg-transparent'
				}`}>
				<nav
					className={`mx-auto flex max-w-6xl items-center gap-6 px-6 text-sm transition-all duration-300 ${
						scrolled ? 'py-2.5' : 'py-4'
					}`}>
					<Link to="/" className="font-display text-base font-bold">
						KBVE <span className="text-quest-400">Jobs</span>
					</Link>

					{/* Desktop links */}
					<div className="hidden items-center gap-6 md:flex">
						{items.map((i) => (
							<Link key={i.to} to={i.to} className={navLink}>
								{i.label}
							</Link>
						))}
					</div>

					<div className="ml-auto flex items-center gap-3">
						<div className="hidden items-center gap-3 md:flex">
							{user ? (
								<>
									<Link
										to="/account"
										className="text-xs text-zinc-400 transition hover:text-quest-200 [&.active]:text-quest-300">
										@{user.handle}
									</Link>
									<button
										type="button"
										onClick={signOut}
										className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition hover:border-quest-500 hover:text-quest-200">
										Sign out
									</button>
								</>
							) : (
								<Link
									to="/login"
									className="rounded-full bg-quest-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-quest-400">
									Log in
								</Link>
							)}
						</div>

						{/* Mobile hamburger */}
						<button
							type="button"
							aria-label="Open menu"
							aria-expanded={open}
							onClick={() => setOpen(true)}
							className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 text-zinc-200 md:hidden">
							<svg
								viewBox="0 0 24 24"
								className="h-5 w-5"
								aria-hidden>
								<path
									d="M4 7h16M4 12h16M4 17h16"
									stroke="currentColor"
									strokeWidth="1.8"
									strokeLinecap="round"
								/>
							</svg>
						</button>
					</div>
				</nav>
			</header>

			{/* Mobile drawer + backdrop (kept mounted for slide animation) */}
			<div
				className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
					open ? 'opacity-100' : 'pointer-events-none opacity-0'
				}`}
				onClick={() => setOpen(false)}
				aria-hidden
			/>
			<aside
				role="dialog"
				aria-modal="true"
				aria-label="Menu"
				className={`fixed inset-y-0 right-0 z-50 flex w-72 max-w-[80vw] flex-col border-l border-zinc-800 bg-zinc-950 p-5 shadow-2xl transition-transform duration-300 md:hidden ${
					open ? 'translate-x-0' : 'translate-x-full'
				}`}>
				<div className="mb-6 flex items-center justify-between">
					<span className="font-display text-base font-bold">
						KBVE <span className="text-quest-400">Jobs</span>
					</span>
					<button
						type="button"
						aria-label="Close menu"
						onClick={() => setOpen(false)}
						className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 text-zinc-200">
						<svg
							viewBox="0 0 24 24"
							className="h-5 w-5"
							aria-hidden>
							<path
								d="M6 6l12 12M18 6L6 18"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
							/>
						</svg>
					</button>
				</div>

				<nav className="flex flex-col gap-1">
					{items.map((i) => (
						<Link
							key={i.to}
							to={i.to}
							onClick={() => setOpen(false)}
							className="rounded-lg px-3 py-2.5 text-base text-zinc-200 transition hover:bg-zinc-800/70 [&.active]:bg-quest-500/15 [&.active]:text-quest-200">
							{i.label}
						</Link>
					))}
				</nav>

				<div className="mt-auto border-t border-zinc-800 pt-4">
					{user ? (
						<div className="flex items-center justify-between">
							<Link
								to="/account"
								onClick={() => setOpen(false)}
								className="text-xs text-zinc-400 transition hover:text-quest-200">
								@{user.handle}
							</Link>
							<button
								type="button"
								onClick={() => {
									setOpen(false);
									signOut();
								}}
								className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition hover:border-quest-500 hover:text-quest-200">
								Sign out
							</button>
						</div>
					) : (
						<Link
							to="/login"
							onClick={() => setOpen(false)}
							className="block rounded-lg bg-quest-500 px-3 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-quest-400">
							Log in
						</Link>
					)}
				</div>
			</aside>
		</>
	);
}
