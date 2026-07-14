import { Link } from '@tanstack/react-router';
import type { Gig } from '../api/types';
import { formatBudget, LOCATION_LABELS, relativeTime } from '../lib/format';
import { Avatar, TagRow } from './ui';

export function GigCard({ gig }: { gig: Gig }) {
	const tags = [...gig.disciplines, ...gig.tools, ...gig.skills];
	return (
		<Link
			to="/gigs/$gigId"
			params={{ gigId: gig.id }}
			className="panel group flex flex-col gap-3 p-5 transition hover:border-quest-500/70 hover:bg-zinc-900/70">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h3 className="font-display text-lg font-semibold leading-snug text-zinc-100 group-hover:text-quest-200">
						{gig.title}
					</h3>
					<p className="mt-1 text-sm text-zinc-400">{gig.summary}</p>
				</div>
				<div className="shrink-0 text-right">
					<div className="font-display text-base font-bold text-loot-400">
						{formatBudget(gig)}
					</div>
					<div className="text-xs text-zinc-500">
						{LOCATION_LABELS[gig.location_pref]}
					</div>
				</div>
			</div>

			<TagRow items={tags} />

			<div className="mt-1 flex items-center justify-between border-t border-zinc-800/70 pt-3 text-xs text-zinc-500">
				<span className="flex items-center gap-2">
					{gig.poster ? (
						<>
							<Avatar
								src={gig.poster.avatar_url}
								alt={gig.poster.org_name}
								size={20}
							/>
							<span className="text-zinc-400">{gig.poster.org_name}</span>
						</>
					) : (
						<span>Unknown studio</span>
					)}
				</span>
				<span>
					{gig.applicant_count} applied · {relativeTime(gig.published_at)}
				</span>
			</div>
		</Link>
	);
}
