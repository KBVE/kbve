/**
 * ProfileHero - Glassmorphism capsule card with avatar and user info
 * Features:
 * - Avatar on left, bio/status on right (responsive)
 * - Full ARIA support for accessibility
 * - Status indicator with live region
 * - Badge list for roles/achievements
 * - Glassmorphism design for the sticky parallax hero
 * - Askama-compatible: all props can be passed from server-side template
 */
import { LazyAvatar } from './LazyAvatar';

export interface ProfileHeroProps {
	/** User's avatar URL */
	avatarUrl?: string | null;
	/** Display name / username */
	username: string;
	/** User's email (optional) */
	email?: string;
	/** Bio text (optional) */
	bio?: string;
	/** Status message (optional) */
	status?: string;
	/** Array of badge labels */
	badges?: string[];
	/** Whether user is online (shows green indicator) */
	isOnline?: boolean;
	/** Additional CSS classes */
	className?: string;
}

export function ProfileHero({
	avatarUrl,
	username,
	email,
	bio,
	status,
	badges = [],
	isOnline = false,
	className = '',
}: ProfileHeroProps) {
	const fallbackLetter = (username || email || 'U').charAt(0);

	return (
		<header
			className={`profile-hero ${className}`}
			role="banner"
			aria-label={`${username}'s profile`}>
			<div className="profile-hero__content">
				{/* Avatar - Left Side */}
				<div className="profile-hero__avatar-wrapper">
					<LazyAvatar
						src={avatarUrl}
						alt={`${username}'s profile picture`}
						fallback={fallbackLetter}
						size="xl"
						borderColor="var(--sl-color-bg, #0a0a0a)"
					/>
					{/* Online indicator */}
					{isOnline && (
						<span
							className="profile-hero__online-indicator"
							aria-label="Online"
							title="Online"
						/>
					)}
				</div>

				{/* User Info - Right Side */}
				<section
					className="profile-hero__info"
					aria-labelledby="profile-username">
					<h1
						id="profile-username"
						className="profile-hero__username">
						{username}
					</h1>

					{/* Status with live region for dynamic updates */}
					{status && (
						<p
							className="profile-hero__status"
							role="status"
							aria-live="polite"
							aria-label={`Status: ${status}`}>
							<span
								className="profile-hero__status-dot"
								aria-hidden="true"
							/>
							{status}
						</p>
					)}

					{/* Email (if provided and different from username) */}
					{email && email !== username && (
						<p className="profile-hero__email">{email}</p>
					)}

					{/* Bio */}
					{bio && <p className="profile-hero__bio">{bio}</p>}

					{/* Badges as a list for screen readers */}
					{badges.length > 0 && (
						<ul
							className="profile-hero__badges"
							aria-label="User badges"
							role="list">
							{badges.map((badge, index) => (
								<li
									key={`${badge}-${index}`}
									className="profile-hero__badge">
									{badge}
								</li>
							))}
						</ul>
					)}
				</section>
			</div>

			<style>{`
        /* Glassmorphism capsule card for the profile hero */
        .profile-hero {
          background: linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          padding: 1.5rem;
          box-shadow:
            0 25px 50px -12px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(255, 255, 255, 0.05),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        @media (min-width: 768px) {
          .profile-hero {
            padding: 2rem;
          }
        }

        .profile-hero__content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          text-align: center;
        }

        @media (min-width: 768px) {
          .profile-hero__content {
            flex-direction: row;
            align-items: flex-end;
            gap: 1.5rem;
            text-align: left;
          }
        }

        .profile-hero__avatar-wrapper {
          position: relative;
          flex-shrink: 0;
        }

        .profile-hero__online-indicator {
          position: absolute;
          bottom: 8px;
          right: 8px;
          width: 20px;
          height: 20px;
          background: #22c55e;
          border: 3px solid rgba(30, 41, 59, 0.9);
          border-radius: 50%;
          box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
        }

        .profile-hero__info {
          flex: 1;
          min-width: 0;
        }

        .profile-hero__username {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--sl-color-text, #f5f5f5);
          margin: 0 0 0.25rem;
          line-height: 1.2;
        }

        @media (min-width: 768px) {
          .profile-hero__username {
            font-size: 2rem;
          }
        }

        .profile-hero__status {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.875rem;
          color: var(--sl-color-accent, #a78bfa);
          margin: 0 0 0.5rem;
        }

        .profile-hero__status-dot {
          width: 8px;
          height: 8px;
          background: #22c55e;
          border-radius: 50%;
          animation: status-pulse 2s ease-in-out infinite;
        }

        @keyframes status-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .profile-hero__email {
          font-size: 0.875rem;
          color: var(--sl-color-gray-2, #a3a3a3);
          margin: 0 0 0.5rem;
        }

        .profile-hero__bio {
          font-size: 0.875rem;
          color: var(--sl-color-gray-1, #d4d4d4);
          margin: 0 0 0.75rem;
          max-width: 500px;
          line-height: 1.5;
        }

        .profile-hero__badges {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin: 0;
          padding: 0;
          list-style: none;
          justify-content: center;
        }

        @media (min-width: 768px) {
          .profile-hero__badges {
            justify-content: flex-start;
          }
        }

        .profile-hero__badge {
          display: inline-flex;
          align-items: center;
          font-size: 0.625rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 0.25rem 0.625rem;
          border-radius: 9999px;
          background: rgba(167, 139, 250, 0.15);
          color: var(--sl-color-accent, #a78bfa);
          border: 1px solid rgba(167, 139, 250, 0.3);
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .profile-hero__status-dot {
            animation: none;
          }
        }
      `}</style>
		</header>
	);
}

export default ProfileHero;
