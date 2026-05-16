/** @jsxImportSource react */
import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $activeUsers, $nick } from '../service';
import { $avatarUrl } from '../auth';
import { nickColor, nickInitial } from '../format';

const PROFILE_BASE = 'https://kbve.com/@';

interface UserCardProps {
	nick: string;
	isSelf: boolean;
	avatar: string;
	onClose: () => void;
}

const UserCard: React.FC<UserCardProps> = ({
	nick,
	isSelf,
	avatar,
	onClose,
}) => {
	const color = nickColor(nick);
	const profileUrl = `${PROFILE_BASE}${encodeURIComponent(nick)}`;

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [onClose]);

	return (
		<div
			className="kbve-chat__user-card-backdrop"
			onClick={onClose}
			role="dialog"
			aria-modal="true">
			<div
				className="kbve-chat__user-card"
				onClick={(e) => e.stopPropagation()}>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close"
					className="kbve-chat__user-card-close">
					×
				</button>
				<div
					className="kbve-chat__user-card-banner"
					style={{ background: color }}
				/>
				<div className="kbve-chat__user-card-body">
					{avatar ? (
						<img
							src={avatar}
							alt={nick}
							className="kbve-chat__user-card-avatar"
						/>
					) : (
						<span
							className="kbve-chat__user-card-avatar kbve-chat__user-card-avatar--initial"
							style={{ background: color }}>
							{nickInitial(nick)}
						</span>
					)}
					<div
						className="kbve-chat__user-card-nick"
						style={{ color }}>
						{nick}
						{isSelf && (
							<span className="kbve-chat__user-card-tag">
								you
							</span>
						)}
					</div>
					<div className="kbve-chat__user-card-handle">@{nick}</div>
					<div className="kbve-chat__user-card-actions">
						<a
							href={profileUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="kbve-chat__overlay-btn kbve-chat__overlay-btn--primary">
							View profile on kbve.com →
						</a>
					</div>
				</div>
			</div>
		</div>
	);
};

export const UserList: React.FC = () => {
	const users = useStore($activeUsers);
	const selfNick = useStore($nick);
	const selfAvatar = useStore($avatarUrl);
	const [openNick, setOpenNick] = useState<string | null>(null);

	const handleOpen = useCallback((user: string) => setOpenNick(user), []);
	const handleClose = useCallback(() => setOpenNick(null), []);

	const openIsSelf = openNick !== null && openNick === selfNick;
	const openAvatar = openIsSelf ? selfAvatar : '';

	return (
		<>
			<div className="kbve-chat__users-head">
				<span className="kbve-chat__rail-label">
					Members ({users.length})
				</span>
			</div>
			<div className="kbve-chat__users-list">
				{users.length === 0 && (
					<div
						style={{
							padding: '8px 10px',
							fontSize: '13px',
							color: 'var(--sl-color-gray-4)',
						}}>
						No one here yet
					</div>
				)}
				{users.map((user) => {
					const isSelf = user === selfNick;
					const color = nickColor(user);
					return (
						<button
							key={user}
							type="button"
							onClick={() => handleOpen(user)}
							className="kbve-chat__user-item kbve-chat__user-item--btn"
							title={`Open ${user}'s profile`}>
							{isSelf && selfAvatar ? (
								<img
									src={selfAvatar}
									alt={user}
									className="kbve-chat__user-avatar"
									loading="lazy"
								/>
							) : (
								<span
									className="kbve-chat__user-avatar"
									style={{ background: color }}>
									{nickInitial(user)}
								</span>
							)}
							<span style={{ color }}>{user}</span>
							{isSelf && (
								<span className="kbve-chat__user-you-tag">
									you
								</span>
							)}
						</button>
					);
				})}
			</div>
			{openNick && (
				<UserCard
					nick={openNick}
					isSelf={openIsSelf}
					avatar={openAvatar}
					onClose={handleClose}
				/>
			)}
		</>
	);
};
