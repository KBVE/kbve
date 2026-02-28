import { useEffect, useState } from 'react';

export interface ReactTwitchProfileProps {
	username: string;
	avatarUrl?: string;
	isLive?: boolean;
}

function formatDate(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleDateString('en-US', {
		month: 'short',
		year: 'numeric',
	});
}

const ReactTwitchProfile = ({
	username,
	avatarUrl,
	isLive = false,
}: ReactTwitchProfileProps) => {
	if (!username) return null;

	return (
		<section
			className="twitch-profile-card"
			aria-label="Twitch profile details">
			<header className="twitch-header">
				<svg
					className="twitch-logo"
					viewBox="0 0 24 24"
					fill="currentColor"
					aria-hidden="true">
					<path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
				</svg>
				<span className="twitch-title">Twitch Profile</span>
				<a
					href={`https://twitch.tv/${username}`}
					target="_blank"
					rel="noopener noreferrer"
					className="twitch-view-link">
					View Channel
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden="true">
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
					</svg>
				</a>
			</header>

			<div className="twitch-user-info">
				<div className="twitch-avatar">
					{avatarUrl ? (
						<img
							src={avatarUrl}
							alt={`${username}'s Twitch avatar`}
							loading="lazy"
						/>
					) : (
						<svg viewBox="0 0 24 24" fill="currentColor">
							<path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
						</svg>
					)}
				</div>
				<div className="twitch-user-details">
					<h3 className="twitch-name">{username}</h3>
					<p className="twitch-username">twitch.tv/{username}</p>
					<div className="twitch-badges">
						{isLive ? (
							<span className="twitch-badge live">LIVE NOW</span>
						) : (
							<span className="twitch-badge offline">
								Offline
							</span>
						)}
					</div>
				</div>
			</div>

			<footer className="twitch-footer">
				<span>Connected via Twitch OAuth</span>
			</footer>
		</section>
	);
};

export default ReactTwitchProfile;
