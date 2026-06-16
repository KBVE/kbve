// Presentation helpers — turn the API's integer enums + minor-unit money into
// human strings. Pure functions, no React.

import { RANK_ORDER, RANKS } from '../api/client';
import type {
	Availability,
	BudgetType,
	Gig,
	LocationPref,
	RankTier,
	TalentProfile,
} from '../api/types';

export const LOCATION_LABELS: Record<LocationPref, string> = {
	0: 'Remote',
	1: 'On-site',
	2: 'Hybrid',
};

export const AVAILABILITY_LABELS: Record<Availability, string> = {
	0: 'Open to work',
	1: 'Limited',
	2: 'Booked',
};

export const AVAILABILITY_TONE: Record<Availability, string> = {
	0: 'text-emerald-300',
	1: 'text-loot-400',
	2: 'text-zinc-400',
};

/** Minor units → localized currency, dropping cents when whole. */
export function formatMoney(minor: number, currency = 'USD'): string {
	const major = minor / 100;
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency,
		maximumFractionDigits: Number.isInteger(major) ? 0 : 2,
	}).format(major);
}

export function formatBudget(gig: Gig): string {
	const { budget_type, budget_min, budget_max, currency } = gig;
	const lo = formatMoney(budget_min, currency);
	const hi = formatMoney(budget_max, currency);
	switch (budget_type as BudgetType) {
		case 1:
			return lo;
		case 2:
			return budget_min === budget_max ? lo : `${lo}–${hi}`;
		case 3:
			return budget_min === budget_max ? `${lo}/hr` : `${lo}–${hi}/hr`;
		default:
			return 'Budget undisclosed';
	}
}

export function formatRate(t: TalentProfile): string {
	const lo = formatMoney(t.rate_min, t.currency);
	const hi = formatMoney(t.rate_max, t.currency);
	return t.rate_min === t.rate_max ? `${lo}/hr` : `${lo}–${hi}/hr`;
}

export function relativeTime(iso: string | null): string {
	if (!iso) return '';
	const then = Date.parse(iso);
	// Mock data is anchored to mid-2026; compare against the freshest fixture date
	// rather than wall-clock so "posted N days ago" reads sensibly in dev.
	const ref = Date.parse('2026-06-15T12:00:00Z');
	const diff = Math.max(0, ref - then);
	const day = 86_400_000;
	if (diff < day) return 'today';
	const d = Math.round(diff / day);
	if (d < 7) return `${d}d ago`;
	if (d < 30) return `${Math.round(d / 7)}w ago`;
	return `${Math.round(d / 30)}mo ago`;
}

// ── Reputation ladder ──────────────────────────────────────────────────

export interface RankProgress {
	tier: RankTier;
	label: string;
	next: RankTier | null;
	nextLabel: string | null;
	/** 0–1 toward the next tier (1 when maxed). */
	pct: number;
	toNext: number; // reputation remaining to next tier (0 when maxed)
}

export function rankProgress(reputation: number, tier: RankTier): RankProgress {
	const idx = RANK_ORDER.indexOf(tier);
	const current = RANKS[tier];
	const nextTier = RANK_ORDER[idx + 1] ?? null;
	if (!nextTier) {
		return {
			tier,
			label: current.label,
			next: null,
			nextLabel: null,
			pct: 1,
			toNext: 0,
		};
	}
	const next = RANKS[nextTier];
	const span = next.min_reputation - current.min_reputation;
	const into = reputation - current.min_reputation;
	return {
		tier,
		label: current.label,
		next: nextTier,
		nextLabel: next.label,
		pct: Math.max(0, Math.min(1, into / span)),
		toNext: Math.max(0, next.min_reputation - reputation),
	};
}

export const RANK_TONE: Record<RankTier, string> = {
	recruit: 'text-zinc-300 border-zinc-600',
	adventurer: 'text-emerald-300 border-emerald-700',
	artisan: 'text-sky-300 border-sky-700',
	veteran: 'text-quest-300 border-quest-600',
	master: 'text-loot-400 border-loot-500/60',
	legend: 'text-fuchsia-300 border-fuchsia-600',
};
