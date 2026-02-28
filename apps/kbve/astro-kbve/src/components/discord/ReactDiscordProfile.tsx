import { useEffect, useState } from 'react';

export interface ReactDiscordProfileProps {
	username: string;
	avatarUrl?: string;
	discordId?: string;
	nickname?: string;
	joinedAt?: string;
	isBoosting?: boolean;
	roleCount?: number;
	isGuildMember?: boolean;
}

function formatDate(dateStr: string): string {
	try {
		const date = new Date(dateStr);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			year: 'numeric',
		});
	} catch {
		return '-';
	}
}

const ReactDiscordProfile = ({
	username,
	avatarUrl,
	discordId,
	nickname,
	joinedAt,
	isBoosting = false,
	roleCount = 0,
	isGuildMember = false,
}: ReactDiscordProfileProps) => {
	if (!username || !isGuildMember) return null;

	return (
		<section
			className="discord-profile-card"
			aria-label="Discord profile details">
			<header className="discord-header">
				<svg
					className="discord-logo"
					viewBox="0 0 24 24"
					fill="currentColor"
					aria-hidden="true">
					<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
				</svg>
				<span className="discord-title">KBVE Discord Member</span>
				{discordId && (
					<a
						href={`https://discord.com/users/${discordId}`}
						target="_blank"
						rel="noopener noreferrer"
						className="discord-view-link">
						View Profile
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true">
							<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
						</svg>
					</a>
				)}
			</header>

			<div className="discord-user-info">
				<div className="discord-avatar">
					{avatarUrl ? (
						<img
							src={avatarUrl}
							alt={`${username}'s Discord avatar`}
							loading="lazy"
						/>
					) : (
						<svg viewBox="0 0 24 24" fill="currentColor">
							<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
						</svg>
					)}
				</div>
				<div className="discord-user-details">
					<h3 className="discord-name">{username}</h3>
					{nickname && (
						<p className="discord-nickname">Nickname: {nickname}</p>
					)}
					{discordId && <p className="discord-id">ID: {discordId}</p>}
					<div className="discord-badges">
						<span className="discord-badge member">
							KBVE Member
						</span>
						{isBoosting && (
							<span className="discord-badge booster">
								Server Booster
							</span>
						)}
					</div>
				</div>
			</div>

			<div
				className="discord-stats"
				role="list"
				aria-label="Discord statistics">
				<div className="discord-stat" role="listitem">
					<span className="discord-stat-value">{roleCount}</span>
					<span className="discord-stat-label">Roles</span>
				</div>
				{joinedAt && (
					<div className="discord-stat" role="listitem">
						<span className="discord-stat-value">
							{formatDate(joinedAt)}
						</span>
						<span className="discord-stat-label">Member Since</span>
					</div>
				)}
			</div>

			<footer className="discord-footer">
				<span>Connected via Discord OAuth</span>
			</footer>
		</section>
	);
};

export default ReactDiscordProfile;
