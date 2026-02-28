import { useState, useCallback } from 'react';
import { ArrowBigUp, Users, ExternalLink } from 'lucide-react';
import type { ServerCard } from '@/lib/servers/types';
import { CATEGORY_MAP, buildInviteUrl, formatMemberCount } from '@/lib/servers';

interface Props {
	server: ServerCard;
	onVote?: (serverId: string) => void;
}

const slVar = (name: string, fallback: string) =>
	`var(--sl-color-${name}, ${fallback})`;

export function ReactServerCard({ server, onVote }: Props) {
	const [voted, setVoted] = useState(false);

	const handleVote = useCallback(() => {
		if (voted) return;
		setVoted(true);
		onVote?.(server.server_id);
	}, [voted, onVote, server.server_id]);

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
		<div
			style={{
				display: 'flex',
				alignItems: 'stretch',
				gap: '1rem',
				padding: '1rem',
				borderRadius: '0.75rem',
				border: `1px solid ${slVar('gray-5', '#374151')}`,
				backgroundColor: slVar('gray-7', '#1f2937'),
				transition: 'border-color 0.2s, box-shadow 0.2s',
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.borderColor = slVar('accent', '#8b5cf6');
				e.currentTarget.style.boxShadow = `0 0 0 1px ${slVar('accent', '#8b5cf6')}`;
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.borderColor = slVar('gray-5', '#374151');
				e.currentTarget.style.boxShadow = 'none';
			}}>
			{/* Server icon */}
			<div
				style={{
					width: '3.5rem',
					height: '3.5rem',
					minWidth: '3.5rem',
					borderRadius: '50%',
					backgroundColor: slVar('accent-low', '#1e1033'),
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					fontSize: '1.1rem',
					fontWeight: 700,
					color: slVar('accent', '#8b5cf6'),
					overflow: 'hidden',
				}}>
				{server.icon_url ? (
					<img
						src={server.icon_url}
						alt=""
						style={{
							width: '100%',
							height: '100%',
							objectFit: 'cover',
						}}
					/>
				) : (
					initials
				)}
			</div>

			{/* Server info */}
			<div style={{ flex: 1, minWidth: 0 }}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.5rem',
						marginBottom: '0.25rem',
					}}>
					<span
						style={{
							fontWeight: 600,
							fontSize: '1rem',
							color: slVar('text', '#e5e7eb'),
							whiteSpace: 'nowrap',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
						}}>
						{server.name}
					</span>
					{server.is_online && (
						<span
							style={{
								width: '0.5rem',
								height: '0.5rem',
								borderRadius: '50%',
								backgroundColor: '#22c55e',
								flexShrink: 0,
							}}
							title="Online"
						/>
					)}
				</div>

				<p
					style={{
						fontSize: '0.8125rem',
						color: slVar('gray-3', '#9ca3af'),
						margin: 0,
						lineHeight: 1.4,
						display: '-webkit-box',
						WebkitLineClamp: 2,
						WebkitBoxOrient: 'vertical',
						overflow: 'hidden',
					}}>
					{server.summary}
				</p>

				{/* Category badges + member count */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.375rem',
						marginTop: '0.5rem',
						flexWrap: 'wrap',
					}}>
					{categoryBadges.map((cat) => (
						<span
							key={cat!.id}
							style={{
								fontSize: '0.6875rem',
								padding: '0.125rem 0.5rem',
								borderRadius: '9999px',
								backgroundColor: slVar('accent-low', '#1e1033'),
								color: slVar('accent-high', '#c4b5fd'),
								border: `1px solid ${slVar('gray-5', '#374151')}`,
							}}>
							{cat!.label}
						</span>
					))}
					<span
						style={{
							fontSize: '0.75rem',
							color: slVar('gray-3', '#9ca3af'),
							display: 'flex',
							alignItems: 'center',
							gap: '0.25rem',
							marginLeft: 'auto',
						}}>
						<Users size={12} />
						{formatMemberCount(server.member_count)}
					</span>
				</div>
			</div>

			{/* Vote + invite */}
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					gap: '0.375rem',
					minWidth: '3.5rem',
				}}>
				<button
					onClick={handleVote}
					disabled={voted}
					aria-label={`Vote for ${server.name}`}
					style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						padding: '0.375rem 0.5rem',
						borderRadius: '0.5rem',
						border: voted
							? `1px solid ${slVar('accent', '#8b5cf6')}`
							: `1px solid ${slVar('gray-5', '#374151')}`,
						backgroundColor: voted
							? slVar('accent-low', '#1e1033')
							: 'transparent',
						color: voted
							? slVar('accent', '#8b5cf6')
							: slVar('gray-3', '#9ca3af'),
						cursor: voted ? 'default' : 'pointer',
						transition: 'all 0.15s',
						fontSize: '0.75rem',
						fontWeight: 600,
						lineHeight: 1,
					}}>
					<ArrowBigUp
						size={18}
						fill={voted ? 'currentColor' : 'none'}
					/>
					<span>{server.vote_count + (voted ? 1 : 0)}</span>
				</button>

				<a
					href={buildInviteUrl(server.invite_code)}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={`Join ${server.name}`}
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						padding: '0.25rem',
						borderRadius: '0.375rem',
						color: slVar('gray-3', '#9ca3af'),
						transition: 'color 0.15s',
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.color = slVar(
							'accent',
							'#8b5cf6',
						);
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.color = slVar(
							'gray-3',
							'#9ca3af',
						);
					}}>
					<ExternalLink size={16} />
				</a>
			</div>
		</div>
	);
}
