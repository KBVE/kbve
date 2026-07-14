import { Link } from '@tanstack/react-router';

const NAV = [
	{ to: '/play', label: 'Play' },
	{ to: '/downloads', label: 'Downloads' },
] as const;

const EXTERNAL = [
	{ href: 'https://kbve.com', label: 'KBVE' },
	{ href: 'https://discord.gg/kbve', label: 'Discord' },
] as const;

export function Footer() {
	return (
		<footer className="border-t border-neutral-800 bg-neutral-950">
			<div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<div className="text-base font-bold text-violet-300">RentEarth</div>
					<p className="mt-1 text-xs text-neutral-500">
						A KBVE game. Play in the browser or download the desktop client.
					</p>
				</div>
				<nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
					{NAV.map(({ to, label }) => (
						<Link
							key={to}
							to={to}
							className="text-neutral-400 transition-colors hover:text-white">
							{label}
						</Link>
					))}
					{EXTERNAL.map(({ href, label }) => (
						<a
							key={href}
							href={href}
							target="_blank"
							rel="noreferrer"
							className="text-neutral-400 transition-colors hover:text-white">
							{label}
						</a>
					))}
				</nav>
			</div>
			<div className="border-t border-neutral-900 px-4 py-4 text-center text-xs text-neutral-600">
				© KBVE. All rights reserved.
			</div>
		</footer>
	);
}
