// "What we do" — an Upwork-style category grid mapped to our game-dev
// disciplines. Each card deep-links into a filtered gig browse. Icons are
// lucide line glyphs to match the clean, scannable category-card look.

import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
	Box,
	Brush,
	Bug,
	ClipboardList,
	Code2,
	Film,
	Gamepad2,
	Languages,
	LayoutDashboard,
	type LucideIcon,
	Map,
	Music,
	PenLine,
	Repeat,
	Sparkles,
	Users,
} from 'lucide-react';
import { fetchTaxonomy } from '../api/client';

const GAME_DEV_ID = 1;

// slug → icon. Disciplines come from the taxonomy (data-driven); icons are a
// static map so a new discipline simply falls back to the controller glyph.
const ICONS: Record<string, LucideIcon> = {
	'2d-art': Brush,
	'3d-art': Box,
	animation: Film,
	programming: Code2,
	'technical-art': Sparkles,
	audio: Music,
	'game-design': Gamepad2,
	'level-design': Map,
	narrative: PenLine,
	'ui-ux': LayoutDashboard,
	qa: Bug,
	porting: Repeat,
	localization: Languages,
	production: ClipboardList,
	community: Users,
};

export function DisciplineGrid() {
	const { data } = useQuery({
		queryKey: ['taxonomy', GAME_DEV_ID],
		queryFn: () => fetchTaxonomy(GAME_DEV_ID),
	});
	const disciplines = (data?.taxonomy ?? []).filter((t) => t.kind === 1);
	if (!disciplines.length) return null;

	return (
		<section className="py-10">
			<header className="mb-6">
				<h2 className="font-display text-2xl font-bold">
					Hire for every part of your game
				</h2>
				<p className="text-sm text-zinc-400">
					From pixel art to netcode — vetted talent across the whole pipeline.
				</p>
			</header>

			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
				{disciplines.map((d) => {
					const Icon = ICONS[d.name] ?? Gamepad2;
					return (
						<Link
							key={d.id}
							to="/gigs"
							search={{ discipline: d.name }}
							className="panel group flex flex-col gap-3 p-4 transition hover:border-quest-500/70 hover:bg-zinc-900/70">
							<Icon className="h-7 w-7 text-gold-400 transition group-hover:text-quest-300" />
							<span className="font-medium leading-tight text-zinc-100">
								{d.label}
							</span>
						</Link>
					);
				})}
			</div>
		</section>
	);
}
