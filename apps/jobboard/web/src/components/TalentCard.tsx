import { Link } from '@tanstack/react-router';
import type { TalentProfile } from '../api/types';
import {
	AVAILABILITY_LABELS,
	AVAILABILITY_TONE,
	formatRate,
} from '../lib/format';
import { Avatar, RankPill, Stars, TagRow } from './ui';
import { RANKS } from '../api/client';

export function TalentCard({ talent }: { talent: TalentProfile }) {
	const tags = [...talent.disciplines, ...talent.tools].slice(0, 4);
	return (
		<Link
			to="/talent/$handle"
			params={{ handle: talent.handle }}
			className="panel group flex flex-col gap-3 p-5 transition hover:border-quest-500/70 hover:bg-zinc-900/70">
			<div className="flex items-start gap-3">
				<Avatar
					src={talent.avatar_url}
					alt={talent.display_name}
					size={48}
				/>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h3 className="truncate font-display font-semibold text-zinc-100 group-hover:text-quest-200">
							{talent.display_name}
						</h3>
						<RankPill
							tier={talent.rank}
							label={RANKS[talent.rank].label}
						/>
					</div>
					<p className="truncate text-sm text-zinc-400">
						{talent.headline}
					</p>
				</div>
			</div>

			<TagRow items={tags} />

			<div className="mt-auto flex items-center justify-between border-t border-zinc-800/70 pt-3 text-xs">
				<Stars value={talent.rating_avg} count={talent.rating_count} />
				<span className="flex items-center gap-2">
					<span className={AVAILABILITY_TONE[talent.availability]}>
						{AVAILABILITY_LABELS[talent.availability]}
					</span>
					<span className="text-zinc-500">·</span>
					<span className="text-loot-400">{formatRate(talent)}</span>
				</span>
			</div>
		</Link>
	);
}
