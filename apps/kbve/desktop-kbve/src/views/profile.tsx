import { useEffect } from 'react';
import { ThemeProvider, themeFromCssVars } from '../lib/rn-theme';
import { Surface, Stack, Text, Badge } from '@kbve/rn/ui';
import { SettingsCard } from '../components/SettingsCard';
import { SettingsRow } from '../components/SettingsRow';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { useAuthStore } from '../stores/auth';
import { useSidecarStore } from '../stores/sidecarStore';
import { useKbveProfileStore } from '../stores/kbveProfile';

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
	const discordQuickConnect = useSidecarStore((s) => s.discordQuickConnect);
	const setDiscordQuickConnect = useSidecarStore(
		(s) => s.setDiscordQuickConnect,
	);
	const lastDiscordGuildName = useSidecarStore((s) => s.lastDiscordGuildName);
	const lastDiscordChannelName = useSidecarStore(
		(s) => s.lastDiscordChannelName,
	);
	const kbveProfile = useKbveProfileStore((s) => s.profile);
	const kbveProfileLoading = useKbveProfileStore((s) => s.loading);
	const loadKbveProfile = useKbveProfileStore((s) => s.load);

	const accessToken = session?.access_token ?? null;
	useEffect(() => {
		if (!accessToken) return;
		void loadKbveProfile(accessToken);
	}, [accessToken, loadKbveProfile]);

	if (!user) {
		return (
			<div className="view-column">
				<SettingsCard title="Profile">
					<p className="px-5 py-4 text-caption" style={muted}>
						Not signed in.
					</p>
				</SettingsCard>
				<SettingsCard title="About">
					<div className="flex flex-col gap-2 px-5 py-4">
						<p className="text-body" style={muted}>
							KBVE Desktop — Version 0.1.0
						</p>
						<p className="text-body" style={muted}>
							MIT License
						</p>
					</div>
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

			<SettingsCard title="KBVE Profile">
				<SettingsRow
					label="Username"
					description="Your kbve.com identity">
					{kbveProfileLoading && !kbveProfile ? (
						<span className="text-caption" style={muted}>
							Loading…
						</span>
					) : kbveProfile?.username ? (
						<a
							href={`https://kbve.com/@${kbveProfile.username}`}
							target="_blank"
							rel="noreferrer"
							className="text-body">
							@{kbveProfile.username}
						</a>
					) : (
						<span className="text-caption" style={muted}>
							{kbveProfile
								? 'No username claimed'
								: 'Unavailable'}
						</span>
					)}
				</SettingsRow>
				<SettingsRow
					label="Connected providers"
					description="Accounts linked to your KBVE profile">
					<span className="text-caption" style={muted}>
						{kbveProfile?.connected_providers?.length
							? kbveProfile.connected_providers.join(', ')
							: 'None'}
					</span>
				</SettingsRow>
			</SettingsCard>

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

			<SettingsCard title="Discord">
				<SettingsRow
					label="Quick connect"
					description="Automatically rejoin the last voice channel on app start">
					<ToggleSwitch
						checked={discordQuickConnect}
						onChange={(next) => void setDiscordQuickConnect(next)}
					/>
				</SettingsRow>
				<SettingsRow
					label="Last voice channel"
					description="Saved from your most recent connection">
					<span className="text-caption" style={muted}>
						{lastDiscordGuildName && lastDiscordChannelName
							? `${lastDiscordGuildName} / ${lastDiscordChannelName}`
							: 'None yet'}
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

			<SettingsCard title="About">
				<div className="flex flex-col gap-2 px-5 py-4">
					<p className="text-body" style={muted}>
						KBVE Desktop — Version 0.1.0
					</p>
					<p className="text-body" style={muted}>
						A cross-platform desktop application built with Tauri,
						React, and Rust.
					</p>
					<p className="text-body" style={muted}>
						MIT License
					</p>
				</div>
			</SettingsCard>
		</div>
	);
}
