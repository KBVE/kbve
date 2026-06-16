// "How the board works" — a two-sided flow with a For hiring / For finding work
// toggle (à la Upwork). Each side is a connected three-step quest line; the
// finding-work side ends on the real reputation ladder so the claim is concrete.

import { type ReactNode, useState } from 'react';
import {
	FilePlus2,
	Gamepad2,
	type LucideIcon,
	Rocket,
	ShieldCheck,
	TrendingUp,
	Users,
} from 'lucide-react';
import { RANK_ORDER, RANKS } from '../api/client';
import { RANK_TONE } from '../lib/format';

type Mode = 'hiring' | 'finding';

interface Step {
	n: string;
	title: string;
	body: string;
	Icon: LucideIcon;
	extra?: ReactNode;
}

function RankLadder() {
	return (
		<div className="mt-3 flex flex-wrap items-center justify-center gap-1 lg:justify-start">
			{RANK_ORDER.map((tier, i) => (
				<span key={tier} className="flex items-center gap-1">
					<span
						className={`rounded border bg-zinc-900/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${RANK_TONE[tier]}`}>
						{RANKS[tier].label}
					</span>
					{i < RANK_ORDER.length - 1 && (
						<span className="text-zinc-600">›</span>
					)}
				</span>
			))}
		</div>
	);
}

const FLOWS: Record<Mode, Step[]> = {
	hiring: [
		{
			n: '01',
			title: 'Post a gig',
			body: 'Describe the work, budget, and the disciplines, engines, and skills it needs.',
			Icon: FilePlus2,
		},
		{
			n: '02',
			title: 'Review vetted applicants',
			body: 'Portfolio-backed, screened talent applies. No bidding wars, no spam.',
			Icon: Users,
		},
		{
			n: '03',
			title: 'Hire & ship',
			body: 'Pick your match and start. Work and payment happen off-platform in v1.',
			Icon: Rocket,
		},
	],
	finding: [
		{
			n: '01',
			title: 'Prove your work',
			body: 'Get vetted by your portfolio — the screen is the moat, the work is the résumé.',
			Icon: ShieldCheck,
		},
		{
			n: '02',
			title: 'Take on quests',
			body: 'Apply to game-dev gigs tagged by discipline, engine, and skill.',
			Icon: Gamepad2,
		},
		{
			n: '03',
			title: 'Rank up',
			body: 'Earn reputation from real signals — shipped credits, studio vouches, jam wins.',
			Icon: TrendingUp,
			extra: <RankLadder />,
		},
	],
};

export function HowItWorks() {
	const [mode, setMode] = useState<Mode>('hiring');
	const steps = FLOWS[mode];

	return (
		<section className="py-14">
			<div className="mb-10 flex flex-col items-center justify-between gap-4 sm:flex-row">
				<div className="text-center sm:text-left">
					<span className="text-xs font-semibold uppercase tracking-[0.2em] text-quest-400">
						The quest line
					</span>
					<h2 className="mt-2 font-display text-2xl font-bold">
						How the board works
					</h2>
				</div>

				{/* For hiring / For finding work toggle */}
				<div className="flex rounded-full border border-zinc-700 bg-zinc-900/60 p-1 text-sm">
					{(
						[
							['hiring', 'For hiring'],
							['finding', 'For finding work'],
						] as [Mode, string][]
					).map(([key, label]) => (
						<button
							key={key}
							type="button"
							onClick={() => setMode(key)}
							className={`rounded-full px-4 py-1.5 font-medium transition ${
								mode === key
									? 'bg-quest-500 text-white'
									: 'text-zinc-400 hover:text-zinc-200'
							}`}>
							{label}
						</button>
					))}
				</div>
			</div>

			<div className="relative grid gap-10 lg:grid-cols-3 lg:gap-6">
				{/* connecting path behind the nodes (desktop) */}
				<div className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-px bg-linear-to-r from-quest-700/0 via-quest-600/60 to-quest-700/0 lg:block" />

				{steps.map((s) => (
					<div
						key={s.n}
						className="relative flex flex-col items-center text-center lg:items-start lg:text-left">
						<div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-quest-700/60 bg-zinc-900 text-quest-300 shadow-lg shadow-quest-950/60">
							<s.Icon className="h-6 w-6" />
							<span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 text-[10px] font-bold text-zinc-400">
								{s.n}
							</span>
						</div>
						<h3 className="mt-4 font-display text-lg font-semibold">
							{s.title}
						</h3>
						<p className="mt-1.5 max-w-xs text-sm text-zinc-400 lg:max-w-none">
							{s.body}
						</p>
						{s.extra}
					</div>
				))}
			</div>
		</section>
	);
}
