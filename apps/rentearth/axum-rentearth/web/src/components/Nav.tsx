import { Link } from '@tanstack/react-router';

const LINKS = [
	{ to: '/', label: 'Home' },
	{ to: '/play', label: 'Play' },
	{ to: '/downloads', label: 'Downloads' },
] as const;

export function Nav() {
	return (
		<header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
			<nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
				<Link to="/" className="flex items-center gap-2">
					<span className="text-lg font-bold tracking-tight text-violet-300">
						RentEarth
					</span>
				</Link>
				<ul className="flex items-center gap-1">
					{LINKS.map(({ to, label }) => (
						<li key={to}>
							<Link
								to={to}
								className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
								activeProps={{ className: 'text-violet-300' }}
								activeOptions={{ exact: to === '/' }}>
								{label}
							</Link>
						</li>
					))}
				</ul>
			</nav>
		</header>
	);
}
