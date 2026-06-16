// Small, dependency-free UI primitives shared across screens.

import type { ReactNode } from 'react';
import type { Badge as BadgeT, RankTier, TaxonomyItem } from '../api/types';
import { RANK_TONE } from '../lib/format';

const KIND_TONE: Record<number, string> = {
	1: 'border-quest-600/50 bg-quest-500/10 text-quest-200', // discipline
	2: 'border-sky-700/50 bg-sky-500/10 text-sky-200', // tool
	3: 'border-zinc-700 bg-zinc-800/60 text-zinc-300', // skill
};

export function Tag({
	item,
	onClick,
	active,
}: {
	item: TaxonomyItem;
	onClick?: () => void;
	active?: boolean;
}) {
	const tone = KIND_TONE[item.kind] ?? KIND_TONE[3];
	const cls = `inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone} ${
		active ? 'ring-2 ring-quest-400/70' : ''
	} ${onClick ? 'cursor-pointer hover:brightness-125' : ''}`;
	return onClick ? (
		<button type="button" onClick={onClick} className={cls}>
			{item.label}
		</button>
	) : (
		<span className={cls}>{item.label}</span>
	);
}

export function TagRow({ items }: { items: TaxonomyItem[] }) {
	if (!items.length) return null;
	return (
		<div className="flex flex-wrap gap-1.5">
			{items.map((t) => (
				<Tag key={`${t.kind}-${t.id}`} item={t} />
			))}
		</div>
	);
}

export function BadgePill({ badge }: { badge: BadgeT }) {
	return (
		<span
			title={badge.description}
			className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-xs text-zinc-200">
			<span aria-hidden>{badge.icon}</span>
			{badge.label}
		</span>
	);
}

export function RankPill({ tier, label }: { tier: RankTier; label: string }) {
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${RANK_TONE[tier]}`}>
			<span aria-hidden>★</span>
			{label}
		</span>
	);
}

export function Avatar({
	src,
	alt,
	size = 40,
}: {
	src: string;
	alt: string;
	size?: number;
}) {
	return (
		<img
			src={src}
			alt={alt}
			width={size}
			height={size}
			className="rounded-full border border-zinc-700 object-cover"
			style={{ width: size, height: size }}
		/>
	);
}

type ButtonProps = {
	children: ReactNode;
	variant?: 'primary' | 'ghost' | 'outline';
	type?: 'button' | 'submit';
	onClick?: () => void;
	disabled?: boolean;
	className?: string;
};

export function Button({
	children,
	variant = 'primary',
	type = 'button',
	onClick,
	disabled,
	className = '',
}: ButtonProps) {
	const base =
		'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
	const tones = {
		primary:
			'bg-quest-500 text-white hover:bg-quest-400 shadow-lg shadow-quest-900/40',
		outline:
			'border border-zinc-700 text-zinc-100 hover:border-quest-500 hover:text-quest-200',
		ghost: 'text-zinc-300 hover:text-white hover:bg-zinc-800/60',
	};
	return (
		<button
			type={type}
			onClick={onClick}
			disabled={disabled}
			className={`${base} ${tones[variant]} ${className}`}>
			{children}
		</button>
	);
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
	return (
		<div className="flex items-center gap-3 text-zinc-400">
			<span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-quest-400" />
			{label}
		</div>
	);
}

export function ErrorNote({ error }: { error: unknown }) {
	const msg = error instanceof Error ? error.message : String(error);
	return (
		<p className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-red-300">
			Something went wrong: {msg}
		</p>
	);
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
	return (
		<div className="panel px-6 py-12 text-center">
			<p className="text-lg font-semibold text-zinc-200">{title}</p>
			{hint ? <p className="mt-1 text-sm text-zinc-400">{hint}</p> : null}
		</div>
	);
}
