import { useQuery } from '@tanstack/react-query';
import { fetchClients, PLATFORMS, type ClientVersion } from '../api';

export function DownloadsPage() {
	const { data, isLoading, isError } = useQuery({
		queryKey: ['downloads'],
		queryFn: fetchClients,
		refetchInterval: 60_000,
	});

	const byPlatform = new Map<string, ClientVersion>(
		(data ?? []).map((c) => [c.platform, c]),
	);

	return (
		<div className="mx-auto flex max-w-2xl flex-col p-6">
			<h1 className="mb-1 text-3xl font-bold text-violet-300">Downloads</h1>
			<p className="mb-8 text-sm text-neutral-400">
				Download the desktop client for your platform.
			</p>

			{isLoading && <p className="text-neutral-500">Loading builds…</p>}
			{isError && (
				<p className="text-red-400">Build status unavailable. Try again shortly.</p>
			)}

			<div className="space-y-3">
				{!isLoading &&
					PLATFORMS.map(({ slug, name }) => {
						const c = byPlatform.get(slug);
						return (
							<div
								key={slug}
								className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900 p-4">
								<div>
									<div className="font-semibold">{name}</div>
									<div className="text-xs text-neutral-500">
										{c
											? `v${c.user_version ?? '—'}${c.live ? '' : ` (${c.state ?? 'processing'})`}`
											: 'no build available'}
									</div>
								</div>
								{c && c.live ? (
									<a
										href={`/downloads/${slug}`}
										className="rounded-lg bg-violet-500 px-4 py-2 font-semibold text-black hover:bg-violet-400">
										Download
									</a>
								) : (
									<span className="rounded-lg bg-neutral-700 px-4 py-2 text-sm text-neutral-400">
										{c ? 'Processing…' : 'Unavailable'}
									</span>
								)}
							</div>
						);
					})}
			</div>
		</div>
	);
}
