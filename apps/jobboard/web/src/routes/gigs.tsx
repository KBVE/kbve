import { useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { fetchGigs, fetchTaxonomy } from '../api/client';
import type { GigQuery, LocationPref, TaxonomyItem } from '../api/types';
import { GigCard } from '../components/GigCard';
import { EmptyState, ErrorNote, Spinner } from '../components/ui';
import { LOCATION_LABELS } from '../lib/format';

const GAME_DEV_ID = 1;
const routeApi = getRouteApi('/gigs');

export function GigsPage() {
	const search = routeApi.useSearch();
	const navigate = routeApi.useNavigate();

	const { data: taxData } = useQuery({
		queryKey: ['taxonomy', GAME_DEV_ID],
		queryFn: () => fetchTaxonomy(GAME_DEV_ID),
	});
	const {
		data: gigData,
		isLoading,
		error,
	} = useQuery({
		queryKey: ['gigs', search],
		queryFn: () => fetchGigs(search),
	});

	const tax = taxData?.taxonomy ?? [];
	const disciplines = tax.filter((t) => t.kind === 1);
	const tools = tax.filter((t) => t.kind === 2);
	const skills = tax.filter((t) => t.kind === 3);

	const patch = (next: Partial<GigQuery>) =>
		navigate({ search: (prev) => ({ ...prev, ...next }) });

	const activeCount = Object.values(search).filter(
		(v) => v !== undefined && v !== '',
	).length;

	return (
		<div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[16rem_1fr]">
			<aside className="space-y-6">
				<div>
					<input
						type="search"
						value={search.q ?? ''}
						onChange={(e) => patch({ q: e.target.value || undefined })}
						placeholder="Search gigs…"
						className="w-full rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-quest-500 focus:outline-none"
					/>
				</div>

				<FacetGroup
					label="Discipline"
					items={disciplines}
					selected={search.discipline}
					onToggle={(name) =>
						patch({ discipline: search.discipline === name ? undefined : name })
					}
				/>
				<FacetGroup
					label="Engine / Tool"
					items={tools}
					selected={search.tool}
					onToggle={(name) =>
						patch({ tool: search.tool === name ? undefined : name })
					}
				/>
				<FacetGroup
					label="Skill"
					items={skills}
					selected={search.skill}
					onToggle={(name) =>
						patch({ skill: search.skill === name ? undefined : name })
					}
				/>

				<div>
					<h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
						Location
					</h4>
					<div className="flex flex-wrap gap-1.5">
						{([0, 1, 2] as LocationPref[]).map((lp) => (
							<button
								key={lp}
								type="button"
								onClick={() =>
									patch({
										location_pref:
											search.location_pref === lp ? undefined : lp,
									})
								}
								className={`rounded-full border px-3 py-1 text-xs ${
									search.location_pref === lp
										? 'border-quest-500 bg-quest-500/15 text-quest-200'
										: 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
								}`}>
								{LOCATION_LABELS[lp]}
							</button>
						))}
					</div>
				</div>

				{activeCount > 0 && (
					<button
						type="button"
						onClick={() => navigate({ search: {} })}
						className="text-xs text-zinc-400 underline hover:text-zinc-200">
						Clear all filters
					</button>
				)}
			</aside>

			<section>
				<header className="mb-5 flex items-end justify-between">
					<div>
						<h1 className="font-display text-2xl font-bold">Open gigs</h1>
						<p className="text-sm text-zinc-400">
							Curated game-dev work · both sides vetted
						</p>
					</div>
					{gigData ? (
						<span className="text-sm text-zinc-500">
							{gigData.gigs.length} result
							{gigData.gigs.length === 1 ? '' : 's'}
						</span>
					) : null}
				</header>

				{isLoading ? (
					<Spinner label="Loading gigs…" />
				) : error ? (
					<ErrorNote error={error} />
				) : gigData && gigData.gigs.length > 0 ? (
					<div className="grid gap-4">
						{gigData.gigs.map((gig) => (
							<GigCard key={gig.id} gig={gig} />
						))}
					</div>
				) : (
					<EmptyState
						title="No gigs match those filters"
						hint="Try clearing a filter or widening your search."
					/>
				)}
			</section>
		</div>
	);
}

function FacetGroup({
	label,
	items,
	selected,
	onToggle,
}: {
	label: string;
	items: TaxonomyItem[];
	selected: string | undefined;
	onToggle: (name: string) => void;
}) {
	if (!items.length) return null;
	return (
		<div>
			<h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
				{label}
			</h4>
			<div className="flex flex-wrap gap-1.5">
				{items.map((t) => {
					const active = selected === t.name;
					return (
						<button
							key={t.id}
							type="button"
							onClick={() => onToggle(t.name)}
							className={`rounded-full border px-2.5 py-0.5 text-xs ${
								active
									? 'border-quest-500 bg-quest-500/15 text-quest-200'
									: 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
							}`}>
							{t.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
