// ReactUserProfile - User profile dashboard with Supabase auth
// Fetches enriched profile data from /api/v1/profile/me
// Uses Dexie (via WorkerCommunication) for client-side caching
import React, { useEffect, useState, useRef } from 'react';
import { initSupa, getSupa } from '@/lib/supa';
import { useAuthBridge } from '@/components/auth';
import { getWorkerCommunication } from '@/lib/gateway/WorkerCommunication';
import {
	User,
	Settings,
	LogOut,
	ArrowLeft,
	Circle,
	ExternalLink,
	Loader2,
	RefreshCw,
} from 'lucide-react';

// Cache configuration
const PROFILE_CACHE_KEY = 'cache:profile:me';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type Session = any;
type OAuthProvider = 'github' | 'twitch' | 'discord';

interface UserIdentity {
	provider: string;
	identity_data?: {
		email?: string;
		preferred_username?: string;
		avatar_url?: string;
		full_name?: string;
		name?: string;
	};
}

// API Profile response types
interface DiscordProfile {
	id: string;
	username?: string;
	avatar_url?: string;
	is_guild_member?: boolean;
	guild_nickname?: string;
	joined_at?: string;
	role_ids?: string[];
	role_names?: string[];
	is_boosting?: boolean;
}

interface GithubProfile {
	id: string;
	username?: string;
	avatar_url?: string;
}

interface TwitchProfile {
	id: string;
	username?: string;
	avatar_url?: string;
	is_live?: boolean;
}

interface ApiProfile {
	username: string;
	user_id: string;
	email?: string;
	role?: string;
	profile_exists: boolean;
	discord?: DiscordProfile;
	github?: GithubProfile;
	twitch?: TwitchProfile;
	connected_providers?: string[];
	provider_count?: number;
}

// Cached profile with timestamp for TTL checking
interface CachedProfile {
	profile: ApiProfile;
	cached_at: number;
	user_id: string;
}

type ProfileState = 'loading' | 'authenticated' | 'unauthenticated';

// Connection status for health indicator
// green: API + Worker both working
// yellow: Only one system working (degraded)
// orange: Partial failure with issues
// red: Nothing working
type ConnectionStatus = 'green' | 'yellow' | 'orange' | 'red';

interface ConnectionHealth {
	status: ConnectionStatus;
	apiOk: boolean;
	workerOk: boolean;
	message: string;
}

// Brand icons (not available in lucide-react)
const DiscordIcon = ({ size = 16 }: { size?: number }) => (
	<svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
		<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
	</svg>
);

const GithubIcon = ({ size = 16 }: { size?: number }) => (
	<svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
		<path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
	</svg>
);

const TwitchIcon = ({ size = 16 }: { size?: number }) => (
	<svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
		<path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
	</svg>
);

const providerIcons: Record<string, React.ReactElement> = {
	discord: <DiscordIcon size={16} />,
	github: <GithubIcon size={16} />,
	google: <Circle size={16} />,
	twitch: <TwitchIcon size={16} />,
};

const providerColors: Record<string, string> = {
	discord: '#5865F2',
	github: '#238636',
	google: '#EA4335',
	twitch: '#9146FF',
};

// Status colors for the connection indicator
const statusColors: Record<ConnectionStatus, string> = {
	green: '#22c55e',
	yellow: '#eab308',
	orange: '#f97316',
	red: '#ef4444',
};

const statusMessages: Record<ConnectionStatus, string> = {
	green: 'All systems operational',
	yellow: 'Degraded - using fallback',
	orange: 'Partial outage',
	red: 'Connection failed',
};

export default function ReactUserProfile() {
	const [state, setState] = useState<ProfileState>('loading');
	const [session, setSession] = useState<Session | null>(null);
	const [apiProfile, setApiProfile] = useState<ApiProfile | null>(null);
	const [profileLoading, setProfileLoading] = useState(false);
	const [fromCache, setFromCache] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [connectionHealth, setConnectionHealth] = useState<ConnectionHealth>({
		status: 'yellow',
		apiOk: false,
		workerOk: false,
		message: 'Initializing...',
	});
	const initRef = useRef(false);

	const { signInWithOAuth, loading: authLoading } = useAuthBridge();

	// Update connection health based on API and Worker status
	function updateConnectionHealth(apiOk: boolean, workerOk: boolean) {
		let status: ConnectionStatus;
		let message: string;

		if (apiOk && workerOk) {
			status = 'green';
			message = 'API + Cache connected';
		} else if (apiOk && !workerOk) {
			status = 'yellow';
			message = 'API only (cache unavailable)';
		} else if (!apiOk && workerOk) {
			status = 'yellow';
			message = 'Cache only (API unavailable)';
		} else {
			status = 'red';
			message = 'Offline - using session data';
		}

		setConnectionHealth({ status, apiOk, workerOk, message });
	}

	// Get cached profile from Dexie (via WorkerCommunication)
	async function getCachedProfile(
		userId: string,
	): Promise<ApiProfile | null> {
		try {
			const comm = getWorkerCommunication();
			const cached =
				await comm.getState<CachedProfile>(PROFILE_CACHE_KEY);

			if (!cached) {
				console.log('[ReactUserProfile] No cached profile found');
				return null;
			}

			// Verify user_id matches (in case of account switch)
			if (cached.user_id !== userId) {
				console.log(
					'[ReactUserProfile] Cache user_id mismatch, invalidating',
				);
				await comm.removeState(PROFILE_CACHE_KEY);
				return null;
			}

			// Check TTL
			const age = Date.now() - cached.cached_at;
			if (age > CACHE_TTL_MS) {
				console.log(
					'[ReactUserProfile] Cache expired (age: %dms)',
					age,
				);
				return null;
			}

			console.log('[ReactUserProfile] Cache hit (age: %dms)', age);
			return cached.profile;
		} catch (e: any) {
			console.warn('[ReactUserProfile] Cache read error:', e?.message);
			return null;
		}
	}

	// Save profile to Dexie cache
	async function setCachedProfile(profile: ApiProfile): Promise<void> {
		try {
			const comm = getWorkerCommunication();
			const cached: CachedProfile = {
				profile,
				cached_at: Date.now(),
				user_id: profile.user_id,
			};
			await comm.setState(PROFILE_CACHE_KEY, cached);
			console.log(
				'[ReactUserProfile] Profile cached for user:',
				profile.username,
			);
		} catch (e: any) {
			console.warn('[ReactUserProfile] Cache write error:', e?.message);
		}
	}

	// Clear profile cache (on logout)
	async function clearProfileCache(): Promise<void> {
		try {
			const comm = getWorkerCommunication();
			await comm.removeState(PROFILE_CACHE_KEY);
			console.log('[ReactUserProfile] Profile cache cleared');
		} catch (e: any) {
			console.warn('[ReactUserProfile] Cache clear error:', e?.message);
		}
	}

	// Fetch enriched profile from API (with optional background refresh)
	async function fetchApiProfile(
		accessToken: string,
		isBackgroundRefresh = false,
	) {
		if (!isBackgroundRefresh) {
			setProfileLoading(true);
		}
		try {
			const response = await fetch('/api/v1/profile/me', {
				headers: {
					Authorization: `Bearer ${accessToken}`,
					'Content-Type': 'application/json',
				},
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				console.warn('[ReactUserProfile] API error:', errorData);
				// Don't fail completely - we still have session data
				return null;
			}

			const data: ApiProfile = await response.json();
			console.log(
				'[ReactUserProfile] API profile loaded:',
				data.username,
			);

			// Cache the fresh profile
			await setCachedProfile(data);

			return data;
		} catch (e: any) {
			console.warn(
				'[ReactUserProfile] Failed to fetch API profile:',
				e?.message,
			);
			return null;
		} finally {
			if (!isBackgroundRefresh) {
				setProfileLoading(false);
			}
		}
	}

	// Load profile with cache-first strategy + health tracking
	async function loadProfile(accessToken: string, userId: string) {
		let workerOk = false;
		let apiOk = false;

		// 1. Try cache first for instant display
		try {
			const cached = await getCachedProfile(userId);
			if (cached) {
				setApiProfile(cached);
				setFromCache(true);
				workerOk = true; // Cache read succeeded
				console.log('[ReactUserProfile] Worker/Dexie OK - cache hit');
			} else {
				// No cache but worker is still functional
				workerOk = true;
				console.log(
					'[ReactUserProfile] Worker/Dexie OK - no cached data',
				);
			}
		} catch (e) {
			console.warn('[ReactUserProfile] Worker/Dexie FAILED');
			workerOk = false;
		}

		// 2. Fetch fresh data from API (background if we have cache)
		const hasCache = workerOk && fromCache;
		try {
			const freshProfile = await fetchApiProfile(accessToken, hasCache);

			if (freshProfile) {
				setApiProfile(freshProfile);
				setFromCache(false);
				apiOk = true;
				console.log('[ReactUserProfile] API OK - profile fetched');
			} else {
				// API returned null but didn't throw - partial success
				apiOk = false;
				console.log('[ReactUserProfile] API returned null');
			}
		} catch (e) {
			console.warn('[ReactUserProfile] API FAILED');
			apiOk = false;
		}

		// Update connection health
		updateConnectionHealth(apiOk, workerOk);
	}

	useEffect(() => {
		// Prevent double initialization
		if (initRef.current) return;
		initRef.current = true;

		let off: (() => void) | null = null;
		let isCancelled = false;

		(async () => {
			try {
				await initSupa();
				if (isCancelled) return;

				const supa = getSupa();
				const s = await supa.getSession().catch(() => null);
				if (isCancelled) return;

				const currentSession = s?.session ?? null;
				setSession(currentSession);
				setState(
					currentSession?.user ? 'authenticated' : 'unauthenticated',
				);

				// Load profile with cache-first strategy if authenticated
				if (currentSession?.access_token && currentSession?.user?.id) {
					await loadProfile(
						currentSession.access_token,
						currentSession.user.id,
					);
				}

				// Listen for auth changes
				off = supa.on('auth', async (msg: any) => {
					if (isCancelled) return;
					const newSession = msg.session ?? null;
					setSession(newSession);
					setState(
						newSession?.user ? 'authenticated' : 'unauthenticated',
					);

					// Load profile on sign in (cache-first)
					if (newSession?.access_token && newSession?.user?.id) {
						await loadProfile(
							newSession.access_token,
							newSession.user.id,
						);
					} else {
						// Clear cache and state on sign out
						setApiProfile(null);
						setFromCache(false);
						await clearProfileCache();
					}
				});
			} catch (e: any) {
				if (isCancelled) return;
				console.error('[ReactUserProfile] Init error:', e?.message);
				setError(e?.message ?? 'Failed to initialize');
				setState('unauthenticated');
			}
		})();

		return () => {
			isCancelled = true;
			off?.();
		};
	}, []);

	async function handleOAuthSignIn(provider: OAuthProvider) {
		setError(null);
		try {
			await signInWithOAuth(provider);
		} catch (err: any) {
			setError(err?.message ?? 'Sign-in failed');
		}
	}

	async function handleLogout() {
		try {
			// Clear profile cache before signing out
			await clearProfileCache();
			const supa = getSupa();
			await supa.signOut();
			window.location.href = '/';
		} catch (e: any) {
			console.error('Logout failed:', e);
			setError(e?.message ?? 'Logout failed');
		}
	}

	// Manual refresh (force fetch from API)
	async function handleRefreshProfile() {
		if (!session?.access_token) return;
		setFromCache(false);

		let apiOk = false;
		let workerOk = connectionHealth.workerOk; // Keep existing worker status

		const profile = await fetchApiProfile(session.access_token, false);
		if (profile) {
			setApiProfile(profile);
			apiOk = true;

			// Try to update cache - this tests worker health
			try {
				await setCachedProfile(profile);
				workerOk = true;
			} catch {
				workerOk = false;
			}
		}

		updateConnectionHealth(apiOk, workerOk);
	}

	// Loading State
	if (state === 'loading') {
		return (
			<div className="not-content">
				<div className="profile-card" style={styles.card}>
					<div style={styles.loadingContainer}>
						<div style={styles.loadingAvatar}>
							<div style={styles.skeleton} />
						</div>
						<div style={styles.loadingContent}>
							<div
								style={{
									...styles.skeletonText,
									width: '8rem',
									height: '1.5rem',
								}}
							/>
							<div
								style={{
									...styles.skeletonText,
									width: '6rem',
									height: '1rem',
									marginTop: '0.5rem',
								}}
							/>
						</div>
						<p style={styles.loadingText}>
							Loading your profile...
						</p>
					</div>
				</div>
			</div>
		);
	}

	// Unauthenticated State
	if (state === 'unauthenticated') {
		return (
			<div className="not-content">
				<div className="profile-card" style={styles.card}>
					<div style={styles.authContainer}>
						<div style={styles.authIcon}>
							<User size={40} color="white" strokeWidth={1.5} />
						</div>
						<h2 style={styles.authTitle}>Welcome to KBVE</h2>
						<p style={styles.authSubtitle}>
							Sign in to access your profile and connect your
							accounts
						</p>

						{error && <div style={styles.errorBox}>{error}</div>}

						<div style={styles.authButtons}>
							<button
								onClick={() => handleOAuthSignIn('github')}
								disabled={authLoading}
								style={styles.oauthBtn}>
								<GithubIcon size={20} />
								Sign in with GitHub
							</button>

							<button
								onClick={() => handleOAuthSignIn('discord')}
								disabled={authLoading}
								style={{
									...styles.oauthBtn,
									background: '#5865F2',
									borderColor: '#5865F2',
								}}>
								<DiscordIcon size={20} />
								Sign in with Discord
							</button>

							<button
								onClick={() => handleOAuthSignIn('twitch')}
								disabled={authLoading}
								style={{
									...styles.oauthBtn,
									background: '#9146FF',
									borderColor: '#9146FF',
								}}>
								<TwitchIcon size={20} />
								Sign in with Twitch
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// Authenticated State
	const user = session?.user;

	// Prefer API profile data, fallback to session data
	const displayName =
		apiProfile?.username ||
		user?.user_metadata?.full_name ||
		user?.user_metadata?.name ||
		user?.email?.split('@')[0] ||
		'User';
	const avatarLetter = (displayName?.[0] || 'U').toUpperCase();

	// Get best avatar URL from API profile or session
	const avatarUrl =
		apiProfile?.discord?.avatar_url ||
		apiProfile?.github?.avatar_url ||
		apiProfile?.twitch?.avatar_url ||
		user?.user_metadata?.avatar_url ||
		user?.user_metadata?.picture;

	const providers: UserIdentity[] = user?.identities || [];

	// Build connected accounts from API profile or fallback to session identities
	const connectedAccounts = apiProfile
		? [
				apiProfile.discord && {
					provider: 'discord',
					username:
						apiProfile.discord.guild_nickname ||
						apiProfile.discord.username,
					avatar_url: apiProfile.discord.avatar_url,
					is_guild_member: apiProfile.discord.is_guild_member,
					role_names: apiProfile.discord.role_names,
					is_boosting: apiProfile.discord.is_boosting,
				},
				apiProfile.github && {
					provider: 'github',
					username: apiProfile.github.username,
					avatar_url: apiProfile.github.avatar_url,
				},
				apiProfile.twitch && {
					provider: 'twitch',
					username: apiProfile.twitch.username,
					avatar_url: apiProfile.twitch.avatar_url,
					is_live: apiProfile.twitch.is_live,
				},
			].filter(Boolean)
		: providers.map((p) => ({
				provider: p.provider,
				username:
					p.identity_data?.preferred_username ||
					p.identity_data?.name,
				avatar_url: p.identity_data?.avatar_url,
			}));

	return (
		<div className="not-content">
			<div className="profile-card" style={styles.card}>
				{/* Header */}
				<header style={styles.header}>
					<div style={styles.avatar}>
						{avatarUrl ? (
							<img
								src={avatarUrl}
								alt="Avatar"
								style={styles.avatarImg}
							/>
						) : (
							<span style={styles.avatarLetter}>
								{avatarLetter}
							</span>
						)}
					</div>
					<div style={styles.userInfo}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '0.5rem',
							}}>
							<h1 style={styles.userName}>
								{apiProfile?.username
									? `@${apiProfile.username}`
									: displayName}
							</h1>
							{profileLoading ? (
								<Loader2
									size={16}
									style={{
										color: 'var(--sl-color-gray-3)',
										animation: 'spin 1s linear infinite',
									}}
								/>
							) : (
								<button
									onClick={handleRefreshProfile}
									style={styles.refreshBtn}
									title={
										fromCache
											? 'Showing cached data - click to refresh'
											: 'Refresh profile'
									}>
									<RefreshCw size={14} />
								</button>
							)}
							{fromCache && !profileLoading && (
								<span style={styles.cacheIndicator}>
									cached
								</span>
							)}
						</div>
						<p style={styles.userEmail}>
							{apiProfile?.email || user?.email || ''}
						</p>
						<div style={styles.badges}>
							<span style={styles.badge}>KBVE Member</span>
							{apiProfile?.discord?.is_guild_member && (
								<span
									style={{
										...styles.badge,
										background: 'rgba(88, 101, 242, 0.15)',
										color: '#818cf8',
										borderColor: 'rgba(88, 101, 242, 0.3)',
									}}>
									Discord Member
								</span>
							)}
							{apiProfile?.discord?.is_boosting && (
								<span
									style={{
										...styles.badge,
										background: 'rgba(244, 114, 182, 0.15)',
										color: '#f472b6',
										borderColor: 'rgba(244, 114, 182, 0.3)',
									}}>
									Server Booster
								</span>
							)}
						</div>
					</div>
				</header>

				{/* Connection Status Indicator */}
				<div style={styles.statusBar}>
					<div
						style={{
							...styles.statusIndicator,
							background: statusColors[connectionHealth.status],
							boxShadow: `0 0 8px ${statusColors[connectionHealth.status]}40`,
						}}
						title={`API: ${connectionHealth.apiOk ? 'OK' : 'Failed'} | Cache: ${connectionHealth.workerOk ? 'OK' : 'Failed'}`}
					/>
					<span style={styles.statusText}>
						{connectionHealth.message}
					</span>
					<div style={styles.statusDetails}>
						<span
							style={{
								color: connectionHealth.apiOk
									? '#22c55e'
									: '#ef4444',
							}}>
							API
						</span>
						<span style={{ color: 'var(--sl-color-gray-4)' }}>
							•
						</span>
						<span
							style={{
								color: connectionHealth.workerOk
									? '#22c55e'
									: '#ef4444',
							}}>
							Cache
						</span>
					</div>
				</div>

				{/* View Public Profile Link */}
				{apiProfile?.username && (
					<a
						href={`/@${apiProfile.username}`}
						style={styles.publicProfileLink}
						target="_blank"
						rel="noopener noreferrer">
						<ExternalLink size={14} />
						View Public Profile
					</a>
				)}

				{/* Connected Accounts */}
				<section style={styles.section}>
					<h2 style={styles.sectionTitle}>Connected Accounts</h2>
					<div style={styles.providersList}>
						{connectedAccounts.length === 0 ? (
							<p style={styles.noProviders}>
								No connected accounts yet
							</p>
						) : (
							connectedAccounts.map((account: any, index) => (
								<div
									key={index}
									style={{
										...styles.providerItem,
										borderLeftColor:
											providerColors[account.provider] ||
											'#30363d',
									}}>
									<div style={styles.providerIcon}>
										{account.avatar_url ? (
											<img
												src={account.avatar_url}
												alt=""
												style={styles.providerAvatarImg}
											/>
										) : (
											providerIcons[account.provider] || (
												<Circle size={16} />
											)
										)}
									</div>
									<div style={styles.providerInfo}>
										<div
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: '0.5rem',
											}}>
											<p style={styles.providerName}>
												{account.provider
													.charAt(0)
													.toUpperCase() +
													account.provider.slice(1)}
											</p>
											{account.is_live && (
												<span style={styles.liveBadge}>
													LIVE
												</span>
											)}
										</div>
										<p style={styles.providerUsername}>
											{account.username || ''}
										</p>
										{/* Discord Roles */}
										{account.role_names &&
											account.role_names.length > 0 && (
												<div style={styles.rolesList}>
													{account.role_names
														.slice(0, 3)
														.map(
															(
																role: string,
																i: number,
															) => (
																<span
																	key={i}
																	style={
																		styles.roleTag
																	}>
																	{role}
																</span>
															),
														)}
													{account.role_names.length >
														3 && (
														<span
															style={
																styles.roleTag
															}>
															+
															{account.role_names
																.length - 3}
														</span>
													)}
												</div>
											)}
									</div>
								</div>
							))
						)}
					</div>
				</section>

				{/* Account Actions */}
				<section style={styles.section}>
					<h2 style={styles.sectionTitle}>Account</h2>
					<div style={styles.actionsGrid}>
						<a href="/settings" style={styles.actionCard}>
							<Settings size={24} style={styles.actionIcon} />
							<span>Settings</span>
						</a>
						<button onClick={handleLogout} style={styles.logoutBtn}>
							<LogOut size={24} style={styles.actionIcon} />
							<span>Sign Out</span>
						</button>
					</div>
				</section>

				{/* Back Link */}
				<a href="/" style={styles.backLink}>
					<ArrowLeft size={16} />
					Back to KBVE
				</a>
			</div>
		</div>
	);
}

// Inline styles using CSS variables
const styles: Record<string, React.CSSProperties> = {
	card: {
		background:
			'linear-gradient(180deg, var(--sl-color-bg-accent, #164e63) 0%, transparent 100%)',
		boxShadow: 'inset 0 0 0 1px var(--sl-color-hairline, #30363d)',
		padding: '1.25rem',
		maxWidth: '480px',
		width: '100%',
		clipPath:
			'polygon(0.75rem 0%, calc(100% - 0.75rem) 0%, 100% 0.75rem, 100% calc(100% - 0.75rem), calc(100% - 0.75rem) 100%, 0.75rem 100%, 0% calc(100% - 0.75rem), 0% 0.75rem)',
	},
	// Loading styles
	loadingContainer: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		gap: '1rem',
		padding: '1rem 0',
	},
	loadingAvatar: {
		width: 80,
		height: 80,
		borderRadius: '50%',
		overflow: 'hidden',
		background: 'var(--sl-color-hairline, #30363d)',
	},
	skeleton: {
		width: '100%',
		height: '100%',
		background:
			'linear-gradient(90deg, var(--sl-color-hairline, #30363d) 25%, var(--sl-color-bg-accent, #164e63) 50%, var(--sl-color-hairline, #30363d) 75%)',
		backgroundSize: '200% 100%',
		animation: 'shimmer 1.5s ease-in-out infinite',
	},
	skeletonText: {
		background: 'var(--sl-color-hairline, #30363d)',
		borderRadius: 4,
	},
	loadingContent: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
	},
	loadingText: {
		fontSize: '0.875rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
		margin: 0,
	},
	// Auth styles
	authContainer: {
		textAlign: 'center',
		padding: '1rem 0',
	},
	authIcon: {
		width: 80,
		height: 80,
		margin: '0 auto 1.5rem',
		background:
			'linear-gradient(135deg, var(--sl-color-accent, #06b6d4) 0%, var(--sl-color-accent-high, #67e8f9) 100%)',
		borderRadius: '50%',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
	},
	authTitle: {
		fontSize: '1.5rem',
		fontWeight: 700,
		color: 'var(--sl-color-text, #e6edf3)',
		margin: '0 0 0.5rem',
	},
	authSubtitle: {
		fontSize: '0.875rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
		margin: '0 0 1.5rem',
	},
	errorBox: {
		marginBottom: '1rem',
		padding: '0.5rem 1rem',
		background: 'rgba(239, 68, 68, 0.1)',
		border: '1px solid rgba(239, 68, 68, 0.3)',
		borderRadius: '0.5rem',
		color: '#ef4444',
		fontSize: '0.875rem',
	},
	authButtons: {
		display: 'flex',
		flexDirection: 'column',
		gap: '0.75rem',
	},
	oauthBtn: {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: '0.5rem',
		padding: '0.75rem 1.5rem',
		borderRadius: '0.5rem',
		fontSize: '0.875rem',
		fontWeight: 600,
		background: 'transparent',
		color: 'var(--sl-color-text, #e6edf3)',
		border: '1px solid var(--sl-color-hairline, #30363d)',
		cursor: 'pointer',
		transition: 'all 0.2s ease',
		fontFamily: 'inherit',
	},
	// User styles
	header: {
		display: 'flex',
		gap: '0.875rem',
		alignItems: 'center',
		paddingBottom: '1rem',
		borderBottom: '1px solid var(--sl-color-hairline, #30363d)',
		marginBottom: '1rem',
	},
	avatar: {
		width: 56,
		height: 56,
		borderRadius: '50%',
		background:
			'linear-gradient(135deg, var(--sl-color-accent, #06b6d4) 0%, #8b5cf6 100%)',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		flexShrink: 0,
		overflow: 'hidden',
	},
	avatarImg: {
		width: '100%',
		height: '100%',
		objectFit: 'cover',
	},
	avatarLetter: {
		fontSize: '1.5rem',
		fontWeight: 700,
		color: 'white',
		textTransform: 'uppercase',
	},
	userInfo: {
		flex: 1,
		minWidth: 0,
	},
	userName: {
		fontSize: '1.25rem',
		fontWeight: 700,
		color: 'var(--sl-color-text, #e6edf3)',
		margin: '0 0 0.25rem',
	},
	userEmail: {
		fontSize: '0.875rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
		margin: '0 0 0.5rem',
	},
	badges: {
		display: 'flex',
		gap: '0.5rem',
		flexWrap: 'wrap',
	},
	badge: {
		fontSize: '0.625rem',
		fontWeight: 600,
		textTransform: 'uppercase',
		letterSpacing: '0.05em',
		padding: '0.25rem 0.5rem',
		borderRadius: 9999,
		background: 'rgba(6, 182, 212, 0.15)',
		color: 'var(--sl-color-accent-high, #67e8f9)',
		border: '1px solid rgba(6, 182, 212, 0.3)',
	},
	section: {
		marginBottom: '1rem',
	},
	sectionTitle: {
		fontSize: '0.6875rem',
		fontWeight: 600,
		textTransform: 'uppercase',
		letterSpacing: '0.1em',
		color: 'var(--sl-color-gray-3, #8b949e)',
		margin: '0 0 0.75rem',
	},
	providersList: {
		display: 'flex',
		flexDirection: 'column',
		gap: '0.5rem',
	},
	providerItem: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.75rem',
		padding: '0.75rem',
		background: 'rgba(0, 0, 0, 0.2)',
		borderRadius: '0.5rem',
		borderLeft: '3px solid var(--sl-color-hairline, #30363d)',
	},
	providerIcon: {
		width: 32,
		height: 32,
		borderRadius: '50%',
		background: 'var(--sl-color-hairline, #30363d)',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		color: 'var(--sl-color-gray-3, #8b949e)',
		overflow: 'hidden',
	},
	providerAvatarImg: {
		width: '100%',
		height: '100%',
		objectFit: 'cover',
	},
	providerInfo: {
		flex: 1,
	},
	providerName: {
		fontSize: '0.875rem',
		fontWeight: 600,
		color: 'var(--sl-color-text, #e6edf3)',
		margin: 0,
	},
	providerUsername: {
		fontSize: '0.75rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
		margin: 0,
	},
	noProviders: {
		fontSize: '0.875rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
		textAlign: 'center',
		padding: '1rem',
		margin: 0,
	},
	actionsGrid: {
		display: 'grid',
		gridTemplateColumns: '1fr 1fr',
		gap: '0.75rem',
	},
	actionCard: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		gap: '0.5rem',
		padding: '1rem',
		background: 'rgba(0, 0, 0, 0.2)',
		border: '1px solid var(--sl-color-hairline, #30363d)',
		borderRadius: '0.5rem',
		color: 'var(--sl-color-text, #e6edf3)',
		textDecoration: 'none',
		fontSize: '0.75rem',
		fontWeight: 500,
		cursor: 'pointer',
		transition: 'all 0.3s ease',
	},
	logoutBtn: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		gap: '0.5rem',
		padding: '1rem',
		background: 'rgba(0, 0, 0, 0.2)',
		border: '1px solid var(--sl-color-hairline, #30363d)',
		borderRadius: '0.5rem',
		color: 'var(--sl-color-text, #e6edf3)',
		fontSize: '0.75rem',
		fontWeight: 500,
		fontFamily: 'inherit',
		cursor: 'pointer',
		transition: 'all 0.3s ease',
	},
	actionIcon: {
		width: 24,
		height: 24,
		color: 'var(--sl-color-gray-3, #8b949e)',
	},
	backLink: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: '0.5rem',
		marginTop: '1rem',
		paddingTop: '1rem',
		borderTop: '1px solid var(--sl-color-hairline, #30363d)',
		color: 'var(--sl-color-gray-3, #8b949e)',
		textDecoration: 'none',
		fontSize: '0.8125rem',
		transition: 'color 0.3s ease',
	},
	// Public profile link
	publicProfileLink: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.375rem',
		fontSize: '0.75rem',
		color: 'var(--sl-color-accent-high, #67e8f9)',
		textDecoration: 'none',
		marginBottom: '1rem',
		padding: '0.375rem 0.75rem',
		background: 'rgba(6, 182, 212, 0.1)',
		borderRadius: '0.375rem',
		border: '1px solid rgba(6, 182, 212, 0.2)',
		transition: 'all 0.2s ease',
	},
	// Twitch live badge
	liveBadge: {
		fontSize: '0.5625rem',
		fontWeight: 700,
		textTransform: 'uppercase',
		letterSpacing: '0.05em',
		padding: '0.125rem 0.375rem',
		borderRadius: '0.25rem',
		background: '#ef4444',
		color: 'white',
		animation: 'pulse 2s ease-in-out infinite',
	},
	// Discord roles container
	rolesList: {
		display: 'flex',
		flexWrap: 'wrap',
		gap: '0.25rem',
		marginTop: '0.375rem',
	},
	// Individual role tag
	roleTag: {
		fontSize: '0.625rem',
		fontWeight: 500,
		padding: '0.125rem 0.375rem',
		borderRadius: '0.25rem',
		background: 'rgba(88, 101, 242, 0.15)',
		color: '#a5b4fc',
		border: '1px solid rgba(88, 101, 242, 0.25)',
	},
	// Refresh button (next to username)
	refreshBtn: {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: 24,
		height: 24,
		padding: 0,
		background: 'transparent',
		border: 'none',
		borderRadius: '0.25rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
		cursor: 'pointer',
		transition: 'all 0.2s ease',
		opacity: 0.6,
	},
	// Cache indicator badge
	cacheIndicator: {
		fontSize: '0.5625rem',
		fontWeight: 600,
		textTransform: 'uppercase',
		letterSpacing: '0.05em',
		padding: '0.125rem 0.375rem',
		borderRadius: '0.25rem',
		background: 'rgba(251, 191, 36, 0.15)',
		color: '#fbbf24',
		border: '1px solid rgba(251, 191, 36, 0.25)',
	},
	// Connection status bar
	statusBar: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
		padding: '0.5rem 0.75rem',
		marginBottom: '1rem',
		background: 'rgba(0, 0, 0, 0.2)',
		borderRadius: '0.375rem',
		border: '1px solid var(--sl-color-hairline, #30363d)',
	},
	// Status dot indicator
	statusIndicator: {
		width: 8,
		height: 8,
		borderRadius: '50%',
		flexShrink: 0,
		transition: 'all 0.3s ease',
	},
	// Status message text
	statusText: {
		fontSize: '0.6875rem',
		color: 'var(--sl-color-gray-3, #8b949e)',
		flex: 1,
	},
	// Status details (API • Cache)
	statusDetails: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.375rem',
		fontSize: '0.625rem',
		fontWeight: 600,
		textTransform: 'uppercase',
		letterSpacing: '0.05em',
	},
};
