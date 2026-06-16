import { useQuery } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import { fetchTalentByHandle, RANKS } from '../api/client';
import { PortfolioCard } from '../components/PortfolioMedia';
import {
	Avatar,
	BadgePill,
	Button,
	ErrorNote,
	RankPill,
	Stars,
	TagRow,
} from '../components/ui';
import {
	AVAILABILITY_LABELS,
	AVAILABILITY_TONE,
	formatRate,
	rankProgress,
} from '../lib/format';

const routeApi = getRouteApi('/talent/$handle');

function Bar({ className = '' }: { className?: string }) {
	return <div className={`animate-pulse rounded bg-zinc-800 ${className}`} />;
}

function TalentProfileSkeleton() {
	return (
		<div className="mx-auto max-w-5xl">
			<Bar className="h-4 w-24" />

			<header className="panel mt-4 flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
				<Bar className="h-24 w-24 shrink-0 rounded-full" />
				<div className="flex-1 space-y-3">
					<Bar className="h-7 w-56" />
					<Bar className="h-4 w-72 max-w-full" />
					<Bar className="h-4 w-64 max-w-full" />
					<Bar className="h-4 w-40" />
				</div>
				<div className="flex shrink-0 flex-col gap-2">
					<Bar className="h-9 w-32" />
					<Bar className="h-9 w-32" />
				</div>
			</header>

			<section className="mt-5 grid gap-5 lg:grid-cols-[1fr_18rem]">
				<div className="space-y-5">
					<div className="panel space-y-3 p-5">
						<Bar className="h-5 w-20" />
						<Bar className="h-6 w-full" />
						<Bar className="h-6 w-5/6" />
						<Bar className="h-6 w-2/3" />
					</div>
					<div className="space-y-3">
						<Bar className="h-6 w-28" />
						<div className="grid gap-5 sm:grid-cols-2">
							<Bar className="h-40 w-full" />
							<Bar className="h-40 w-full" />
						</div>
					</div>
				</div>
				<aside className="space-y-5">
					<div className="panel space-y-3 p-5">
						<Bar className="h-4 w-24" />
						<Bar className="h-8 w-20" />
						<Bar className="h-2 w-full" />
						<Bar className="h-3 w-40" />
					</div>
				</aside>
			</section>
		</div>
	);
}

export function TalentProfilePage() {
	const { handle } = routeApi.useParams();
	const {
		data: t,
		isLoading,
		error,
	} = useQuery({
		queryKey: ['talent', handle],
		queryFn: () => fetchTalentByHandle(handle),
	});

	if (isLoading) return <TalentProfileSkeleton />;
	if (error) return <ErrorNote error={error} />;
	if (!t) return null;

	const progress = rankProgress(t.reputation, t.rank);

	return (
		<div className="mx-auto max-w-5xl">
			<Link
				to="/talent"
				className="text-sm text-zinc-400 hover:text-quest-300">
				← All talent
			</Link>

			<header className="panel mt-4 flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
				<Avatar src={t.avatar_url} alt={t.display_name} size={96} />
				<div className="flex-1">
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="font-display text-2xl font-bold">
							{t.display_name}
						</h1>
						<RankPill tier={t.rank} label={RANKS[t.rank].label} />
					</div>
					<p className="mt-1 text-zinc-300">{t.headline}</p>
					<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-400">
						<span>{t.location}</span>
						<span>· {t.years_experience} yrs exp</span>
						<span className={AVAILABILITY_TONE[t.availability]}>
							· {AVAILABILITY_LABELS[t.availability]}
						</span>
						<span className="text-loot-400">· {formatRate(t)}</span>
					</div>
					<div className="mt-3">
						<Stars value={t.rating_avg} count={t.rating_count} />
					</div>
				</div>
				<div className="flex shrink-0 flex-col gap-2">
					<Button>Invite to a gig</Button>
					<Button variant="outline">Message</Button>
				</div>
			</header>

			<section className="mt-5 grid gap-5 lg:grid-cols-[1fr_18rem]">
				<div className="space-y-5">
					<div className="panel p-5">
						<h2 className="mb-3 font-display text-lg font-semibold">
							Skills
						</h2>
						<div className="space-y-3">
							<TagRow items={t.disciplines} />
							<TagRow items={t.tools} />
							<TagRow items={t.skills} />
						</div>
					</div>

					<div>
						<h2 className="mb-3 font-display text-xl font-semibold">
							Portfolio
						</h2>
						<div className="grid gap-5 sm:grid-cols-2">
							{t.portfolio.map((item) => (
								<PortfolioCard key={item.id} item={item} />
							))}
						</div>
					</div>
				</div>

				<aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
					{/* Reputation ladder — progression earned from real signals. */}
					<div className="panel p-5">
						<h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
							Reputation
						</h3>
						<div className="mt-2 flex items-baseline gap-2">
							<span className="font-display text-2xl font-bold text-quest-300">
								{t.reputation.toLocaleString()}
							</span>
							<span className="text-xs text-zinc-500">XP</span>
						</div>
						<div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
							<div
								className="h-full rounded-full bg-linear-to-r from-quest-600 to-quest-400"
								style={{
									width: `${Math.round(progress.pct * 100)}%`,
								}}
							/>
						</div>
						<p className="mt-2 text-xs text-zinc-400">
							{progress.next
								? `${progress.toNext.toLocaleString()} XP to ${progress.nextLabel}`
								: 'Max rank — Legend'}
						</p>
					</div>

					{t.badges.length > 0 && (
						<div className="panel p-5">
							<h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
								Badges
							</h3>
							<div className="flex flex-wrap gap-2">
								{t.badges.map((b) => (
									<BadgePill key={b.id} badge={b} />
								))}
							</div>
						</div>
					)}
				</aside>
			</section>
		</div>
	);
}
