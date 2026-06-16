import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { fetchTalent, fetchTaxonomy } from '../api/client';
import type { Availability, TalentQuery } from '../api/types';
import { TalentCard } from '../components/TalentCard';
import { EmptyState, ErrorNote, Spinner } from '../components/ui';
import { AVAILABILITY_LABELS } from '../lib/format';

const GAME_DEV_ID = 1;
const routeApi = getRouteApi('/talent');

export function TalentPage() {
	const search = routeApi.useSearch();
	const navigate = routeApi.useNavigate();

	const { data: taxData } = useQuery({
		queryKey: ['taxonomy', GAME_DEV_ID],
		queryFn: () => fetchTaxonomy(GAME_DEV_ID),
	});
	const { data, isLoading, error } = useQuery({
		queryKey: ['talent-list', search],
		queryFn: () => fetchTalent(search),
	});

	const disciplines = (taxData?.taxonomy ?? []).filter((t) => t.kind === 1);
	const patch = (next: Partial<TalentQuery>) =>
		navigate({ search: (prev) => ({ ...prev, ...next }) });

	return (
		<div className="mx-auto max-w-6xl">
			<header className="mb-5">
				<h1 className="font-display text-2xl font-bold">Browse talent</h1>
				<p className="text-sm text-zinc-400">
					Vetted game-dev specialists · hired by their work, not their résumé
				</p>
			</header>

			<div className="mb-6 flex flex-wrap items-center gap-3">
				<input
					type="search"
					value={search.q ?? ''}
					onChange={(e) => patch({ q: e.target.value || undefined })}
					placeholder="Search talent…"
					className="min-w-56 flex-1 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-quest-500 focus:outline-none"
				/>
				<select
					value={search.discipline ?? ''}
					onChange={(e) => patch({ discipline: e.target.value || undefined })}
					className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-quest-500 focus:outline-none">
					<option value="">All disciplines</option>
					{disciplines.map((d) => (
						<option key={d.id} value={d.name}>
							{d.label}
						</option>
					))}
				</select>
				<select
					value={search.availability ?? ''}
					onChange={(e) =>
						patch({
							availability: e.target.value
								? (Number(e.target.value) as Availability)
								: undefined,
						})
					}
					className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-quest-500 focus:outline-none">
					<option value="">Any availability</option>
					{([0, 1, 2] as Availability[]).map((a) => (
						<option key={a} value={a}>
							{AVAILABILITY_LABELS[a]}
						</option>
					))}
				</select>
			</div>

			{isLoading ? (
				<Spinner label="Loading talent…" />
			) : error ? (
				<ErrorNote error={error} />
			) : data && data.talent.length > 0 ? (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{data.talent.map((t) => (
						<TalentCard key={t.user_id} talent={t} />
					))}
				</div>
			) : (
				<EmptyState title="No talent match those filters" />
			)}
		</div>
	);
}
