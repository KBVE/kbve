import type { CSSProperties, ReactNode } from 'react';
import type { Badge as BadgeT, RankTier, TaxonomyItem } from '../api/types';

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
	name,
	uri,
	src,
	alt,
	size = 40,
}: {
	name?: string;
	uri?: string | null;
	src?: string | null;
	alt?: string;
	size?: number;
}) {
	const source = uri ?? src;
	const dim: CSSProperties = { width: size, height: size };
	if (source) {
		return (
			<img
				src={source}
				alt={alt ?? name ?? ''}
				style={dim}
				className="rounded-full border border-zinc-700 object-cover"
			/>
		);
	}
	return (
		<div
			style={{ ...dim, fontSize: size * 0.4 }}
			className="flex items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 font-semibold text-zinc-200">
			{initials(name ?? alt ?? '')}
		</div>
	);
}

export function Spinner({ label }: { label?: string }) {
	return (
		<div className="flex flex-col items-center justify-center gap-2 py-8">
			<div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-quest-400" />
			{label ? (
				<span className="text-xs text-zinc-400">{label}</span>
			) : null}
		</div>
	);
}

export function Stars({
	value,
	count,
	max = 5,
}: {
	value: number;
	count?: number;
	max?: number;
}) {
	const full = Math.round(value);
	const empty = Math.max(0, max - full);
	return (
		<span className="inline-flex items-center">
			<span style={{ color: '#fbbf24' }}>{'★'.repeat(full)}</span>
			{empty > 0 ? (
				<span className="text-zinc-600">{'★'.repeat(empty)}</span>
			) : null}
			<span className="ml-1 text-xs text-zinc-400">
				{value.toFixed(1)}
				{count !== undefined ? ` (${count})` : ''}
			</span>
		</span>
	);
}

function Chip({
	children,
	label,
	active,
	onPress,
	color,
	background,
	borderColor,
}: {
	children?: ReactNode;
	label?: string;
	active?: boolean;
	onPress?: () => void;
	color?: string;
	background?: string;
	borderColor?: string;
}) {
	const style: CSSProperties = { color, background, borderColor };
	const cls = [
		'inline-flex items-center self-start rounded-full px-2 py-0.5 text-xs font-medium',
		active ? 'border-2' : 'border',
		color ? '' : 'text-zinc-400',
		background ? '' : 'bg-zinc-800',
		borderColor ? '' : 'border-zinc-700',
	].join(' ');
	const inner = children ?? label;
	return onPress ? (
		<button type="button" onClick={onPress} className={cls} style={style}>
			{inner}
		</button>
	) : (
		<span className={cls} style={style}>
			{inner}
		</span>
	);
}

const KIND_COLORS: Record<
	number,
	{ color: string; background: string; borderColor: string }
> = {
	1: {
		color: '#ccc2fb',
		background: 'rgba(124,77,255,0.1)',
		borderColor: 'rgba(106,53,235,0.5)',
	},
	2: {
		color: '#bae6fd',
		background: 'rgba(14,165,233,0.1)',
		borderColor: 'rgba(3,105,161,0.5)',
	},
	3: {
		color: '#d4d4d8',
		background: 'rgba(39,39,42,0.6)',
		borderColor: '#3f3f46',
	},
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
	const c = KIND_COLORS[item.kind] ?? KIND_COLORS[3];
	return (
		<Chip
			label={item.label}
			active={active}
			onPress={onClick}
			color={c.color}
			background={c.background}
			borderColor={c.borderColor}
		/>
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
	return <Chip>{`${badge.icon} ${badge.label}`}</Chip>;
}

const RANK_COLORS: Record<RankTier, { color: string; borderColor: string }> = {
	recruit: { color: '#d4d4d8', borderColor: '#52525b' },
	adventurer: { color: '#6ee7b7', borderColor: '#047857' },
	artisan: { color: '#7dd3fc', borderColor: '#0369a1' },
	veteran: { color: '#ab98f7', borderColor: '#6a35eb' },
	master: { color: '#fbbf24', borderColor: 'rgba(245,158,11,0.6)' },
	legend: { color: '#f0abfc', borderColor: '#c026d3' },
};

export function RankPill({ tier, label }: { tier: RankTier; label: string }) {
	const c = RANK_COLORS[tier];
	return (
		<Chip
			color={c.color}
			borderColor={c.borderColor}
			background="transparent">
			{`★ ${label}`}
		</Chip>
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

export function ErrorNote({ error }: { error: unknown }) {
	const msg = error instanceof Error ? error.message : String(error);
	return (
		<div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
			<p className="font-semibold text-red-400">Something went wrong</p>
			<p className="text-sm text-zinc-400">{msg}</p>
		</div>
	);
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
	return (
		<div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
			<p className="font-semibold text-zinc-100">{title}</p>
			{hint ? <p className="text-sm text-zinc-400">{hint}</p> : null}
		</div>
	);
}
