import { ThemeProvider, themeFromCssVars } from '../lib/rn-theme';
import { Surface, Stack, Text, Badge } from '@kbve/rn/ui';
import { SettingsCard } from '../components/SettingsCard';
import { SettingsRow } from '../components/SettingsRow';
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
	return typeof m.provider === 'string' ? m.provider : null;
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
			{/* Shared @kbve/rn primitives, retinted to the desktop palette. */}
			<ThemeProvider theme={themeFromCssVars()}>
				<Surface>
					<Stack direction="row" gap="md" align="center">
						{user.avatar_url && (
							<img
								src={user.avatar_url}
								alt=""
								className="profile-avatar rounded-full"
							/>
						)}
						<Stack gap="xs">
							<Stack direction="row" gap="sm" align="center" wrap>
								<Text variant="subtitle">
									{user.name ?? 'Account'}
								</Text>
								{provider && (
									<Badge tone="info" label={provider} />
								)}
							</Stack>
							{user.email && (
								<Text variant="caption" tone="muted">
									{user.email}
								</Text>
							)}
						</Stack>
					</Stack>
				</Surface>
			</ThemeProvider>

			<SettingsCard title="Account">
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
