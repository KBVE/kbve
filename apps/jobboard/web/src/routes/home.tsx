import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { fetchGigs, fetchTalent, fetchTaxonomy } from '../api/client';
import { GigCard } from '../components/GigCard';
import { TalentCard } from '../components/TalentCard';
import { HowItWorks } from '../components/HowItWorks';
import { Button } from '../components/ui';

const GAME_DEV_ID = 1;

const TRUST = ['Both sides vetted', 'Game-dev only', 'Portfolio-first', 'No bidding wars'];

export function HomePage() {
	const navigate = useNavigate();
	const [q, setQ] = useState('');

	const { data: taxData } = useQuery({
		queryKey: ['taxonomy', GAME_DEV_ID],
		queryFn: () => fetchTaxonomy(GAME_DEV_ID),
	});
	const { data: gigData } = useQuery({
		queryKey: ['gigs', {}],
		queryFn: () => fetchGigs({}),
	});
	const { data: talentData } = useQuery({
		queryKey: ['talent-list', {}],
		queryFn: () => fetchTalent({}),
	});

	const popular = (taxData?.taxonomy ?? [])
		.filter((t) => t.kind === 1)
		.slice(0, 7);
	const featuredGigs = gigData?.gigs.slice(0, 4) ?? [];
	const topTalent = talentData?.talent.slice(0, 3) ?? [];

	const search = () =>
		navigate({ to: '/gigs', search: { q: q.trim() || undefined } });

	return (
		<div className="mx-auto max-w-6xl">
			{/* Hero — search-first (Fiverr/Upwork), editorial spacing (Toptal) */}
			<section className="py-14 text-center sm:py-20">
				<span className="inline-flex items-center gap-2 rounded-full border border-quest-700/60 bg-quest-500/10 px-3 py-1 text-xs font-medium text-quest-200">
					✦ The quest board for game developers
				</span>
				<h1 className="mx-auto mt-6 max-w-3xl font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
					Hire vetted game-dev talent.{' '}
					<span className="text-quest-400">Or get hired.</span>
				</h1>
				<p className="mx-auto mt-5 max-w-xl text-lg text-zinc-400">
					A curated, both-sides-vetted job board for game development. Quality is
					the product — not volume.
				</p>

				<form
					onSubmit={(e) => {
						e.preventDefault();
						search();
					}}
					className="mx-auto mt-8 flex max-w-xl items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900/70 p-2 shadow-xl shadow-black/30 focus-within:border-quest-500">
					<svg
						className="ml-2 h-5 w-5 shrink-0 text-zinc-500"
						viewBox="0 0 20 20"
						fill="currentColor"
						aria-hidden>
						<path
							fillRule="evenodd"
							d="M9 3.5a5.5 5.5 0 1 0 3.36 9.86l3.14 3.14a1 1 0 0 0 1.42-1.42l-3.14-3.14A5.5 5.5 0 0 0 9 3.5ZM5.5 9a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z"
							clipRule="evenodd"
						/>
					</svg>
					<input
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder="Search gigs — pixel art, netcode, FMOD…"
						className="flex-1 bg-transparent px-1 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
					/>
					<Button type="submit">Search</Button>
				</form>

				{popular.length > 0 && (
					<div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
						<span className="text-zinc-500">Popular:</span>
						{popular.map((d) => (
							<Link
								key={d.id}
								to="/gigs"
								search={{ discipline: d.name }}
								className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 transition hover:border-quest-500 hover:text-quest-200">
								{d.label}
							</Link>
						))}
					</div>
				)}

				<div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-zinc-500">
					{TRUST.map((t) => (
						<span key={t} className="flex items-center gap-1.5">
							<span className="text-quest-400">✓</span>
							{t}
						</span>
					))}
				</div>
			</section>

			{/* Featured gigs — show the product (Fiverr/Upwork content rows) */}
			<Section
				title="Fresh gigs"
				subtitle="Newly posted, open to vetted talent"
				to="/gigs"
				cta="Browse all gigs">
				<div className="grid gap-4 sm:grid-cols-2">
					{featuredGigs.map((gig) => (
						<GigCard key={gig.id} gig={gig} />
					))}
				</div>
			</Section>

			{/* Top talent */}
			<Section
				title="Featured talent"
				subtitle="Hired by their work, not their résumé"
				to="/talent"
				cta="Browse all talent">
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{topTalent.map((t) => (
						<TalentCard key={t.user_id} talent={t} />
					))}
				</div>
			</Section>

			{/* How it works — reframed as a member quest line */}
			<HowItWorks />

			{/* Dual-audience CTA band (Wellfound split) */}
			<section className="panel mb-16 flex flex-col items-center justify-between gap-4 bg-linear-to-r from-quest-900/40 to-zinc-900/40 px-8 py-10 text-center sm:flex-row sm:text-left">
				<div>
					<h2 className="font-display text-2xl font-bold">
						Running a studio?
					</h2>
					<p className="mt-1 text-zinc-400">
						Post a gig and reach vetted, portfolio-backed game-dev talent.
					</p>
				</div>
				<Link to="/post">
					<Button>Post a gig</Button>
				</Link>
			</section>
		</div>
	);
}

function Section({
	title,
	subtitle,
	to,
	cta,
	children,
}: {
	title: string;
	subtitle: string;
	to: '/gigs' | '/talent';
	cta: string;
	children: React.ReactNode;
}) {
	return (
		<section className="py-8">
			<header className="mb-5 flex items-end justify-between">
				<div>
					<h2 className="font-display text-2xl font-bold">{title}</h2>
					<p className="text-sm text-zinc-400">{subtitle}</p>
				</div>
				<Link
					to={to}
					className="shrink-0 text-sm text-quest-300 hover:text-quest-200">
					{cta} →
				</Link>
			</header>
			{children}
		</section>
	);
}
