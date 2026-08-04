import { SettingsCard } from '../components/SettingsCard';
import { SettingsRow } from '../components/SettingsRow';
import { IconUser } from '../components/Icons';
import { useAuthStore } from '../stores/auth';

const muted = { color: 'var(--color-text-muted)' } as const;

function formatDate(iso: string | null | undefined): string {
	if (!iso) return 'Unknown';
	const d = new Date(iso);
	return Number.isNaN(d.getTime())
		? 'Unknown'
		: d.toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			});
}

function providerOf(appMetadata: unknown): string | null {
	if (!appMetadata || typeof appMetadata !== 'object') return null;
	const m = appMetadata as Record<string, unknown>;
	if (typeof m.provider === 'string') return m.provider;
	return null;
}

export function ProfileView() {
	const user = useAuthStore((s) => s.user);
	const session = useAuthStore((s) => s.session);
	const signOut = useAuthStore((s) => s.signOut);

	if (!user) {
		return (
			<div className="view-column">
				<SettingsCard title="Profile">
					<p className="px-5 py-4 text-caption" style={muted}>
						Not signed in.
					</p>
				</SettingsCard>
			</div>
		);
	}

	const provider = providerOf(session?.user.app_metadata);

	return (
		<div className="view-column">
			<div className="profile-hero flex items-center gap-4 rounded-xl border px-5 py-5">
				{user.avatar_url ? (
					<img
						src={user.avatar_url}
						alt=""
						className="profile-avatar rounded-full"
					/>
				) : (
					<span className="profile-avatar flex items-center justify-center rounded-full">
						<IconUser size={28} />
					</span>
				)}
				<div className="flex min-w-0 flex-col gap-1">
					<span className="text-heading font-semibold">
						{user.name ?? 'Account'}
					</span>
					{user.email && (
						<span className="text-caption" style={muted}>
							{user.email}
						</span>
					)}
				</div>
			</div>

			<SettingsCard title="Account">
				{provider && (
					<SettingsRow
						label="Signed in with"
						description="The identity provider used for this session">
						<span className="text-body capitalize">{provider}</span>
					</SettingsRow>
				)}
				<SettingsRow
					label="Member since"
					description="When this account was created">
					<span className="text-body">
						{formatDate(session?.user.created_at)}
					</span>
				</SettingsRow>
				<SettingsRow
					label="User ID"
					description="Your unique Supabase identifier">
					<span className="text-caption font-mono" style={muted}>
						{user.id}
					</span>
				</SettingsRow>
			</SettingsCard>

			<SettingsCard title="Session">
				<SettingsRow
					label="Sign out"
					description="End this session and return to the sign-in screen">
					<button
						type="button"
						onClick={() => void signOut()}
						className="btn btn-danger">
						Sign out
					</button>
				</SettingsRow>
			</SettingsCard>
		</div>
	);
}
