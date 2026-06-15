import { Link } from '@tanstack/react-router';

export function HomePage() {
	return (
		<section className="mx-auto max-w-2xl text-center">
			<h1 className="text-4xl font-bold tracking-tight">
				Find freelance work on KBVE
			</h1>
			<p className="mt-4 text-zinc-400">
				Decoupled job board. Browse verticals, post gigs, hire fast.
			</p>
			<Link
				to="/jobs"
				className="mt-8 inline-block rounded-md bg-sky-500 px-5 py-2.5 font-medium text-white hover:bg-sky-400">
				Browse jobs
			</Link>
		</section>
	);
}
