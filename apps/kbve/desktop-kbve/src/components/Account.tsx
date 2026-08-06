import { useAuthStore } from '../stores/auth';
import { IconDiscord, IconGitHub, IconLogOut, IconUser } from './Icons';
import type { Provider } from '@kbve/tauri';

export function Account({ collapsed = false }: { collapsed?: boolean }) {
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
					collapsed={collapsed}
				/>
			) : phase === 'authing' ? (
				<p
					className="text-caption"
					style={{ color: 'var(--color-text-muted)' }}>
					Signing in…
				</p>
			) : (
				<SignInButtons collapsed={collapsed} />
			)}
		</div>
	);
}

function SignedIn({
	name,
	avatarUrl,
	collapsed,
}: {
	name: string;
	avatarUrl?: string;
	collapsed: boolean;
}) {
	const signOut = useAuthStore((s) => s.signOut);
	return (
		<div className="sidebar-row flex items-center gap-3">
			{avatarUrl ? (
				<img
					src={avatarUrl}
					alt=""
					className="sidebar-icon rounded-full"
				/>
			) : (
				<span
					className="sidebar-icon"
					style={{ color: 'var(--color-text-muted)' }}>
					<IconUser />
				</span>
			)}
			<span
				className={`sidebar-label text-caption flex-1 truncate ${collapsed ? 'pointer-events-none max-w-0 opacity-0' : 'max-w-40 opacity-100'}`}
				style={{ color: 'var(--color-text)' }}
				title={name}>
				{name}
			</span>
			<button
				onClick={() => void signOut()}
				className={`sidebar-label flex-shrink-0 rounded-md p-1 transition-colors ${collapsed ? 'pointer-events-none max-w-0 opacity-0' : 'max-w-12 opacity-100'}`}
				style={{ color: 'var(--color-text-muted)' }}
				title="Sign out">
				<IconLogOut size={14} />
			</button>
		</div>
	);
}

function SignInButtons({ collapsed }: { collapsed: boolean }) {
	const signInWith = useAuthStore((s) => s.signInWith);
	const btn = (provider: Provider, icon: React.ReactNode, label: string) => (
		<button
			onClick={() => void signInWith(provider)}
			className="sidebar-row flex items-center gap-3 rounded-lg px-2 py-1.5 text-caption transition-colors"
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
			<span className="sidebar-icon">{icon}</span>
			<span
				className={`sidebar-label ${collapsed ? 'pointer-events-none max-w-0 opacity-0' : 'max-w-40 opacity-100'}`}>
				{label}
			</span>
		</button>
	);
	return (
		<div className="flex flex-col gap-1">
			{btn('github', <IconGitHub />, 'GitHub')}
			{btn('discord', <IconDiscord />, 'Discord')}
		</div>
	);
}
