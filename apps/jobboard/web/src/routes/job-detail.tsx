import { Link, useParams } from '@tanstack/react-router';

export function JobDetailPage() {
	const { jobId } = useParams({ from: '/jobs/$jobId' });
	return (
		<section className="mx-auto max-w-2xl">
			<Link to="/jobs" className="text-sm text-sky-400">
				← Back
			</Link>
			<h1 className="mt-4 text-2xl font-bold">{jobId}</h1>
			<p className="mt-2 text-zinc-400">Listing detail — wire to API.</p>
		</section>
	);
}
