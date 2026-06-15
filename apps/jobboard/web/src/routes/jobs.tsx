import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { fetchVerticals } from '../api/client';

export function JobsPage() {
	const { data, isLoading, error } = useQuery({
		queryKey: ['verticals'],
		queryFn: fetchVerticals,
	});

	if (isLoading) return <p className="text-zinc-400">Loading…</p>;
	if (error)
		return <p className="text-red-400">Failed to load: {String(error)}</p>;

	return (
		<section className="mx-auto max-w-3xl">
			<h1 className="mb-6 text-2xl font-bold">Verticals</h1>
			<ul className="grid gap-3 sm:grid-cols-2">
				{data?.verticals.map((v) => (
					<li key={v.id}>
						<Link
							to="/jobs/$jobId"
							params={{ jobId: v.slug }}
							className="block rounded-lg border border-zinc-800 p-4 hover:border-sky-500">
							<span className="font-semibold">{v.label}</span>
							<p className="mt-1 text-sm text-zinc-400">
								{v.description}
							</p>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}
