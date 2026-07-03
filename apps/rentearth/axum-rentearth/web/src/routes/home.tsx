import { Link } from '@tanstack/react-router';

export function HomePage() {
	return (
		<div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center">
			<h1 className="text-4xl font-bold tracking-tight text-violet-300 sm:text-5xl">
				RentEarth
			</h1>
			<p className="mt-4 max-w-xl text-neutral-400">
				An isometric action RPG. Jump in from your browser or grab the desktop
				client for your platform.
			</p>
			<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
				<Link
					to="/play"
					className="rounded-lg bg-violet-500 px-5 py-2.5 font-semibold text-black transition-colors hover:bg-violet-400">
					Play in browser
				</Link>
				<Link
					to="/downloads"
					className="rounded-lg border border-neutral-700 px-5 py-2.5 font-semibold text-neutral-200 transition-colors hover:border-neutral-500 hover:text-white">
					Download client
				</Link>
			</div>
		</div>
	);
}
