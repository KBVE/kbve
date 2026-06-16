// "How the board works" reframed as a member quest line — a connected
// progression path (get vetted → take quests → rank up) rather than the generic
// icon/title/body card grid. Step 3 renders the real reputation ladder so the
// "reputation means something" claim is concrete, not a slogan.

import type { ReactNode } from 'react';
import { RANK_ORDER, RANKS } from '../api/client';
import { RANK_TONE } from '../lib/format';

function ShieldIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
			<path
				d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinejoin="round"
			/>
			<path
				d="M9 12l2 2 4-4"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function QuestIcon() {
	// A controller — game-native stand-in for "take on work".
	return (
		<svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
			<path
				d="M6 8h12a3 3 0 0 1 2.9 2.2l1 4A2.6 2.6 0 0 1 17.4 17l-1.6-2H8.2l-1.6 2A2.6 2.6 0 0 1 2.1 14.2l1-4A3 3 0 0 1 6 8z"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinejoin="round"
			/>
			<path
				d="M8 11v2M7 12h2"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
			/>
			<circle cx="16" cy="11.5" r="1" fill="currentColor" />
			<circle cx="17.5" cy="13" r="1" fill="currentColor" />
		</svg>
	);
}

function RankIcon() {
	// Ascending bars — progression.
	return (
		<svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
			<path
				d="M5 20V13M12 20V8M19 20V4"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
			/>
		</svg>
	);
}

interface Step {
	n: string;
	title: string;
	body: string;
	icon: ReactNode;
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

const STEPS: Step[] = [
	{
		n: '01',
		title: 'Prove your work',
		body: 'Both sides are vetted — talent by portfolio, studios by intent. The screen is the moat.',
		icon: <ShieldIcon />,
	},
	{
		n: '02',
		title: 'Take on quests',
		body: 'Post or apply to game-dev gigs tagged by discipline, engine, and skill. No bidding wars.',
		icon: <QuestIcon />,
	},
	{
		n: '03',
		title: 'Rank up',
		body: 'Earn reputation from real signals — shipped credits, studio vouches, jam wins.',
		icon: <RankIcon />,
		extra: <RankLadder />,
	},
];

export function HowItWorks() {
	return (
		<section className="py-14">
			<div className="mb-10 text-center">
				<span className="text-xs font-semibold uppercase tracking-[0.2em] text-quest-400">
					The quest line
				</span>
				<h2 className="mt-2 font-display text-2xl font-bold">
					Three moves from sign-up to shipped
				</h2>
			</div>

			<div className="relative grid gap-10 lg:grid-cols-3 lg:gap-6">
				{/* connecting path behind the nodes (desktop) */}
				<div className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-px bg-linear-to-r from-quest-700/0 via-quest-600/60 to-quest-700/0 lg:block" />

				{STEPS.map((s) => (
					<div
						key={s.n}
						className="relative flex flex-col items-center text-center lg:items-start lg:text-left">
						<div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-quest-700/60 bg-zinc-900 text-quest-300 shadow-lg shadow-quest-950/60">
							{s.icon}
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
