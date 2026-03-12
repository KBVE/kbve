import { memo, useState, useCallback } from 'react';
import { ArrowBigUp, Users, ExternalLink } from 'lucide-react';
import type { ServerCard } from '@/lib/servers/types';
import { CATEGORY_MAP, buildInviteUrl, formatMemberCount } from '@/lib/servers';
import { ExpandButton } from './ExpandButton';

// ── Vote button (interactive island) ────────────────────────────────
// Isolated component so vote state changes only re-render this subtree,
// not the entire card shell (Million.js "block" pattern in React).

interface VoteProps {
	serverId: string;
	serverName: string;
	voteCount: number;
	onVote?: (serverId: string) => Promise<boolean>;
}

const CardVoteButton = memo(function CardVoteButton({
	serverId,
	serverName,
	voteCount,
	onVote,
}: VoteProps) {
	const [voted, setVoted] = useState(false);
	const [voting, setVoting] = useState(false);

	const handleVote = useCallback(async () => {
		if (voted || voting || !onVote) return;
		setVoting(true);
		try {
			const success = await onVote(serverId);
			if (success) setVoted(true);
		} finally {
			setVoting(false);
		}
	}, [voted, voting, onVote, serverId]);

	return (
		<ExpandButton
			icon={
				<ArrowBigUp size={18} fill={voted ? 'currentColor' : 'none'} />
			}
			label="Vote"
			badge={String(voteCount + (voted ? 1 : 0))}
			onClick={handleVote}
			disabled={voted || voting}
			ariaLabel={`Vote for ${serverName}`}
		/>
	);
});

// ── Server card (static shell) ──────────────────────────────────────
// React.memo skips re-render when the server object reference is unchanged.
// applyVote() in serverStore preserves references for non-voted cards,
// so only the voted card's shell re-renders.

interface Props {
	server: ServerCard;
	onVote?: (serverId: string) => Promise<boolean>;
}

export const ReactServerCard = memo(function ReactServerCard({
	server,
	onVote,
}: Props) {
	const categoryBadges = server.categories
		.map((id) => CATEGORY_MAP.get(id))
		.filter(Boolean);

	const initials = server.name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0])
		.join('')
		.toUpperCase();

	return (
		<div className="server-card flex items-stretch gap-4 p-4 rounded-xl sc-border sc-bg">
			{/* Server icon */}
			<div className="sc-icon-wrap">
				{server.icon_url ? (
					<img
						src={server.icon_url}
						alt=""
						loading="lazy"
						decoding="async"
						className="size-full object-cover"
					/>
				) : (
					initials
				)}
			</div>

			{/* Server info (pure static — no state) */}
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 mb-1">
					<span className="sc-name">{server.name}</span>
					{server.is_online && (
						<span
							className="size-2 rounded-full bg-green-500 shrink-0"
							title="Online"
						/>
					)}
				</div>

				<p className="sc-summary">{server.summary}</p>

				{/* Category badges + member count */}
				<div className="flex items-center gap-1.5 mt-2 flex-wrap">
					{categoryBadges.map((cat) => (
						<span key={cat!.id} className="sc-badge">
							{cat!.label}
						</span>
					))}
					<span className="sc-members">
						<Users size={12} />
						{formatMemberCount(server.member_count)}
					</span>
				</div>
			</div>

			{/* Vote + invite */}
			<div className="flex flex-col items-center justify-center gap-1.5 min-w-14">
				<CardVoteButton
					serverId={server.server_id}
					serverName={server.name}
					voteCount={server.vote_count}
					onVote={onVote}
				/>

				<ExpandButton
					icon={<ExternalLink size={16} />}
					label="Join"
					href={buildInviteUrl(server.invite_code)}
					target="_blank"
					rel="noopener noreferrer"
					ariaLabel={`Join ${server.name}`}
				/>
			</div>
		</div>
	);
});
