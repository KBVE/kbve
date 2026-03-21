import { useStore } from '@nanostores/react';
import { forgejoService, timeAgo, type ForgejoUser } from './forgejoService';
import { Shield, UserX, Clock } from 'lucide-react';

function UserCard({ user }: { user: ForgejoUser }) {
	const inactive = !user.active || user.prohibit_login;

	return (
		<div
			style={{
				padding: '0.75rem',
				borderRadius: 10,
				background: 'var(--sl-color-gray-6, #161b22)',
				border: `1px solid ${inactive ? 'rgba(239, 68, 68, 0.2)' : 'var(--sl-color-gray-5, #30363d)'}`,
				display: 'flex',
				gap: 10,
				alignItems: 'center',
				opacity: inactive ? 0.6 : 1,
			}}>
			<img
				src={user.avatar_url}
				alt={user.login}
				style={{
					width: 36,
					height: 36,
					borderRadius: 8,
					flexShrink: 0,
					background: 'var(--sl-color-gray-5, #30363d)',
				}}
			/>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 4,
					}}>
					<span
						style={{
							color: 'var(--sl-color-text, #e6edf3)',
							fontWeight: 600,
							fontSize: '0.8rem',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}>
						{user.login}
					</span>
					{user.is_admin && (
						<Shield
							size={11}
							style={{ color: '#f59e0b', flexShrink: 0 }}
						/>
					)}
					{user.prohibit_login && (
						<UserX
							size={11}
							style={{ color: '#ef4444', flexShrink: 0 }}
						/>
					)}
				</div>
				{user.full_name && user.full_name !== user.login && (
					<div
						style={{
							color: 'var(--sl-color-gray-3, #8b949e)',
							fontSize: '0.7rem',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}>
						{user.full_name}
					</div>
				)}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 3,
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.65rem',
						marginTop: 2,
					}}>
					<Clock size={9} />
					{user.last_login &&
					user.last_login !== '1970-01-01T00:00:00Z'
						? timeAgo(user.last_login)
						: 'never'}
				</div>
			</div>
		</div>
	);
}

export default function ReactForgejoUserGrid() {
	const users = useStore(forgejoService.$users);

	if (users.length === 0) return null;

	return (
		<div className="not-content" style={{ marginTop: '1.5rem' }}>
			<div
				style={{
					fontSize: '0.75rem',
					fontWeight: 600,
					color: 'var(--sl-color-gray-3, #8b949e)',
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
					marginBottom: 10,
				}}>
				Users
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns:
						'repeat(auto-fill, minmax(220px, 1fr))',
					gap: '0.6rem',
				}}>
				{users.map((u) => (
					<UserCard key={u.id} user={u} />
				))}
			</div>
		</div>
	);
}
