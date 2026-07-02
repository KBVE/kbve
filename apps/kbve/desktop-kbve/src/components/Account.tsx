import { useAuthStore } from '../stores/auth';
import { IconDiscord, IconGitHub, IconLogOut, IconUser } from './Icons';
import type { Provider } from '@kbve/tauri';

export function Account() {
	const phase = useAuthStore((s) => s.phase);
	const user = useAuthStore((s) => s.user);

	return (
		<div
			className="sidebar-section flex flex-col gap-2 border-t"
			style={{ borderColor: 'var(--color-border)' }}>
			{phase === 'authed' && user ? (
				<SignedIn
					name={user.name ?? user.email ?? 'Account'}
					avatarUrl={user.avatar_url}
				/>
			) : phase === 'authing' ? (
				<p
					className="text-caption"
					style={{ color: 'var(--color-text-muted)' }}>
					Signing in…
				</p>
			) : (
				<SignInButtons />
			)}
		</div>
	);
}

function SignedIn({
	name,
	avatarUrl,
}: {
	name: string;
	avatarUrl?: string;
}) {
	const signOut = useAuthStore((s) => s.signOut);
	return (
		<div className="flex items-center gap-3">
			{avatarUrl ? (
				<img
					src={avatarUrl}
					alt=""
					className="h-6 w-6 flex-shrink-0 rounded-full"
				/>
			) : (
				<span
					className="flex-shrink-0"
					style={{ color: 'var(--color-text-muted)' }}>
					<IconUser />
				</span>
			)}
			<span
				data-sidebar-label
				className="sidebar-label text-caption flex-1 truncate"
				style={{ color: 'var(--color-text)' }}
				title={name}>
				{name}
			</span>
			<button
				data-sidebar-label
				onClick={() => void signOut()}
				className="sidebar-label flex-shrink-0 rounded-md p-1 transition-colors"
				style={{ color: 'var(--color-text-muted)' }}
				title="Sign out">
				<IconLogOut size={14} />
			</button>
		</div>
	);
}

function SignInButtons() {
	const signInWith = useAuthStore((s) => s.signInWith);
	const btn = (provider: Provider, icon: React.ReactNode, label: string) => (
		<button
			onClick={() => void signInWith(provider)}
			className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-caption transition-colors"
			style={{ color: 'var(--color-text-muted)' }}
			onMouseEnter={(e) => {
				e.currentTarget.style.backgroundColor =
					'var(--color-surface-hover)';
				e.currentTarget.style.color = 'var(--color-text)';
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.backgroundColor = 'transparent';
				e.currentTarget.style.color = 'var(--color-text-muted)';
			}}
			title={`Sign in with ${label}`}>
			<span className="flex-shrink-0">{icon}</span>
			<span data-sidebar-label className="sidebar-label">
				{label}
			</span>
		</button>
	);
	return (
		<div className="flex flex-col gap-1">
			{btn('github', <IconGitHub size={16} />, 'GitHub')}
			{btn('discord', <IconDiscord size={16} />, 'Discord')}
		</div>
	);
}
