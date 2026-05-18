import {
	setAuth,
	AuthPresets,
	applyStaffFlagFromCache,
	bootStaffPermissions,
	clearProfileCache as clearDroidProfileCache,
	clearStaffPermsCache,
	fetchAndCacheProfile,
	getProfileFromCache,
	installProfileSync,
	installSyncBusListener,
	readProfileForFastPaint,
	readSupabaseSessionFromStorage,
	setProfileCache as setDroidProfileCache,
	type DroidProfile,
} from '@kbve/droid';
import { initSupa, getSupa, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supa';
import {
	bootMinecraftCard,
	clearMinecraftCardCache,
} from './cards/minecraft-card.controller';

// ── Constants ───────────────────────────────────────────────────────────────

const INIT_TIMEOUT_MS = 12_000;
const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,23}$/;

// ── Element IDs (must match AstroProfileShell.astro) ────────────────────────

const IDs = {
	shell: 'profile-shell',
	loading: 'profile-state-loading',
	unauth: 'profile-state-unauth',
	usernameSetup: 'profile-state-username',
	profile: 'profile-state-profile',
	profileName: 'profile-slot-name',
	profileEmail: 'profile-slot-email',
	profileAvatarLetter: 'profile-slot-avatar-letter',
	profileAvatarImg: 'profile-slot-avatar-img',
	profilePublicLink: 'profile-slot-public-link',
	profileProviders: 'profile-slot-providers',
	usernameInput: 'profile-username-input',
	usernameHint: 'profile-username-hint',
	usernameError: 'profile-username-error',
	usernameSubmit: 'profile-username-submit',
	logoutBtn: 'profile-logout-btn',
} as const;

// ── Types ───────────────────────────────────────────────────────────────────

type ApiProfile = DroidProfile;

// ── DOM helpers ─────────────────────────────────────────────────────────────

function el(id: string): HTMLElement | null {
	return document.getElementById(id);
}

function show(id: string) {
	const e = el(id);
	if (e) e.hidden = false;
}

function hide(id: string) {
	const e = el(id);
	if (e) e.hidden = true;
}

/** Switch to exactly one state — hide all others. */
function switchState(
	active: 'loading' | 'unauth' | 'usernameSetup' | 'profile',
) {
	const map = {
		loading: IDs.loading,
		unauth: IDs.unauth,
		usernameSetup: IDs.usernameSetup,
		profile: IDs.profile,
	};
	for (const [key, id] of Object.entries(map)) {
		if (key === active) show(id);
		else hide(id);
	}
}

// ── Cache (delegates to @kbve/droid) ────────────────────────────────────────

function clearProfileCache() {
	clearDroidProfileCache();
	clearStaffPermsCache();
	try {
		clearMinecraftCardCache();
	} catch {
		/* best effort */
	}
}

async function fetchProfile(token: string): Promise<ApiProfile | null> {
	return fetchAndCacheProfile({ token, apiBase: window.location.origin });
}

// ── Staff permissions check ─────────────────────────────────────────────────

/**
 * Boot staff permissions via the droid cache: synchronously apply the
 * cached bitmask to `$auth` (paints staff-only panels instantly on a
 * warm cache) and kick off a background refresh that updates the
 * persistent atom for the next paint.
 */
function bootStaff(userId: string, token: string): void {
	bootStaffPermissions({
		userId,
		token,
		apikey: SUPABASE_ANON_KEY,
		supabaseUrl: SUPABASE_URL,
	});
}

// ── Populate profile card slots ─────────────────────────────────────────────

function populateProfile(profile: ApiProfile, session: any) {
	const user = session?.user;

	// Name
	const nameEl = el(IDs.profileName);
	if (nameEl) {
		nameEl.textContent = profile.username
			? `@${profile.username}`
			: user?.user_metadata?.full_name ||
				user?.email?.split('@')[0] ||
				'User';
	}

	// Email
	const emailEl = el(IDs.profileEmail);
	if (emailEl) emailEl.textContent = profile.email || user?.email || '';

	// Avatar
	const avatarUrl =
		profile.discord?.avatar_url ||
		profile.github?.avatar_url ||
		profile.twitch?.avatar_url ||
		user?.user_metadata?.avatar_url;

	const imgEl = el(IDs.profileAvatarImg) as HTMLImageElement | null;
	const letterEl = el(IDs.profileAvatarLetter);
	if (avatarUrl && imgEl) {
		imgEl.src = avatarUrl;
		imgEl.alt = profile.username || 'Avatar';
		imgEl.hidden = false;
		if (letterEl) letterEl.hidden = true;
	} else if (letterEl) {
		letterEl.textContent = (profile.username?.[0] || 'U').toUpperCase();
		letterEl.hidden = false;
		if (imgEl) imgEl.hidden = true;
	}

	// Public profile link
	const linkEl = el(IDs.profilePublicLink) as HTMLAnchorElement | null;
	if (linkEl) {
		if (profile.username) {
			linkEl.href = `/@${profile.username}`;
			linkEl.hidden = false;
		} else {
			linkEl.hidden = true;
		}
	}

	// Connected providers
	const providersEl = el(IDs.profileProviders);
	if (providersEl && profile.connected_providers) {
		providersEl.innerHTML = profile.connected_providers
			.map(
				(p) =>
					`<span class="profile-provider-badge" style="text-transform:capitalize">${p}</span>`,
			)
			.join('');
	}

	// Sync username to global nanostore
	if (profile.username) {
		setAuth({ username: profile.username });
	}
}

// ── Username form handling ──────────────────────────────────────────────────

function validateUsername(value: string): string | null {
	if (!value) return 'Username is required';
	if (value.length < 3) return 'At least 3 characters';
	if (value.length > 24) return '24 characters max';
	if (!/^[a-zA-Z]/.test(value)) return 'Must start with a letter';
	if (!/^[a-zA-Z0-9_]+$/.test(value))
		return 'Letters, numbers, underscores only';
	if (!USERNAME_RE.test(value)) return 'Invalid format';
	return null;
}

let usernameFormBound = false;

function setupUsernameForm(
	token: string,
	onSuccess: (username: string) => void,
) {
	if (usernameFormBound) return;
	usernameFormBound = true;

	const input = el(IDs.usernameInput) as HTMLInputElement | null;
	const hint = el(IDs.usernameHint);
	const errorEl = el(IDs.usernameError);
	const submit = el(IDs.usernameSubmit) as HTMLButtonElement | null;
	if (!input || !submit) return;

	input.addEventListener('input', () => {
		const val = input.value.toLowerCase();
		input.value = val;
		const err = val.length > 0 ? validateUsername(val) : null;
		if (hint) {
			hint.textContent =
				err ||
				(val.length >= 3
					? 'Looks good'
					: '3-24 characters, letters, numbers, underscores');
			hint.style.color = err
				? '#f87171'
				: val.length >= 3
					? '#22c55e'
					: '';
		}
		if (errorEl) errorEl.hidden = true;
		submit.disabled = !!err || val.length < 3;
	});

	submit.addEventListener('click', async (e) => {
		e.preventDefault();
		const val = input.value.toLowerCase();
		const err = validateUsername(val);
		if (err) {
			if (errorEl) {
				errorEl.textContent = err;
				errorEl.hidden = false;
			}
			return;
		}

		submit.disabled = true;
		submit.textContent = 'Setting username...';

		try {
			const res = await fetch('/api/v1/profile/username', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ username: val }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(
					body.error || body.message || 'Failed to set username',
				);
			}
			const body = await res.json();
			onSuccess(body.username || val);
		} catch (e: any) {
			if (errorEl) {
				errorEl.textContent = e?.message || 'Something went wrong';
				errorEl.hidden = false;
			}
			submit.disabled = false;
			submit.textContent = 'Claim username';
		}
	});
}

// ── Logout ──────────────────────────────────────────────────────────────────

function wireLogout() {
	const btn = el(IDs.logoutBtn);
	if (!btn) return;

	btn.addEventListener('click', async (e) => {
		e.preventDefault();
		try {
			clearProfileCache();
			const supa = getSupa();
			await supa.signOut();
			window.location.href = '/';
		} catch (err: any) {
			console.error('[profile] Logout failed:', err?.message);
		}
	});
}

// ── Session handler (shared between boot and auth listener) ─────────────────

async function handleSession(
	session: any,
	source: 'init' | 'auth-event' = 'init',
) {
	if (!session?.user) {
		if (source === 'init') {
			const storageSession = readSupabaseSessionFromStorage();
			if (storageSession?.user?.id) {
				console.log(
					'[profile] Gateway returned no session, but localStorage still has one — keeping cached auth.',
				);
				return;
			}
		}
		clearProfileCache();
		setAuth({
			tone: 'anon',
			name: '',
			username: undefined,
			avatar: undefined,
			id: '',
			error: undefined,
		});
		switchState('unauth');
		return;
	}

	const token = session.access_token;
	const userId = session.user.id;

	// Set initial auth flags (authenticated, not yet staff-checked)
	setAuth({
		tone: 'auth',
		flags: AuthPresets.USER,
		id: userId,
		name: session.user.user_metadata?.full_name ?? '',
		avatar: session.user.user_metadata?.avatar_url,
	});

	// Apply cached staff flag synchronously, refresh in background.
	bootStaff(userId, token);

	// Cache-first for instant display
	const cached = getProfileFromCache(userId);
	if (cached?.username) {
		populateProfile(cached, session);
		switchState('profile');
		bootMinecraftCard(userId, token).catch(() => {});
	}

	// Fetch fresh from API
	const fresh = await fetchProfile(token);
	if (fresh) {
		if (fresh.username) {
			populateProfile(fresh, session);
			switchState('profile');
			bootMinecraftCard(userId, token).catch(() => {});
		} else {
			// No username — show setup form
			switchState('usernameSetup');
			setupUsernameForm(token, (newUsername) => {
				const updated: ApiProfile = {
					...fresh,
					username: newUsername,
					profile_exists: true,
				};
				setDroidProfileCache(updated);
				populateProfile(updated, session);
				setAuth({ username: newUsername });
				switchState('profile');
				bootMinecraftCard(userId, token).catch(() => {});
			});
		}
	} else if (!cached) {
		// No cache, no API — show profile with session data only
		populateProfile(
			{ username: '', user_id: userId, profile_exists: false },
			session,
		);
		switchState('profile');
		bootMinecraftCard(userId, token).catch(() => {});
	}
}

// ── Main boot ───────────────────────────────────────────────────────────────

export async function bootProfile() {
	switchState('loading');
	wireLogout();

	// Subscribe to the cross-context cache bus so a service worker /
	// shared worker can push a profile or staff refresh into the
	// persistent stores. Idempotent — safe to call repeatedly.
	installSyncBusListener();

	// Fast paint: read session + cached profile straight from localStorage
	// before awaiting the Supabase SharedWorker init. With a warm cache the
	// profile card paints in tens of ms instead of the multi-second
	// initSupa round-trip (#11075).
	const fastPaint = readProfileForFastPaint();
	let painted = false;
	if (fastPaint && fastPaint.profile.username) {
		const fpUserId = fastPaint.session.user?.id;
		populateProfile(fastPaint.profile, fastPaint.session);
		switchState('profile');
		painted = true;
		if (fpUserId) {
			// Paint USER flags immediately so the staff cache can lift them
			// to STAFF without flicker, then paint cached staff state.
			setAuth({
				tone: 'auth',
				flags: AuthPresets.USER,
				id: fpUserId,
				name:
					((
						fastPaint.session.user?.user_metadata as
							| Record<string, unknown>
							| undefined
					)?.full_name as string | undefined) ?? '',
				avatar: (
					fastPaint.session.user?.user_metadata as
						| Record<string, unknown>
						| undefined
				)?.avatar_url as string | undefined,
			});
			applyStaffFlagFromCache(fpUserId);
		}
		const fpToken = fastPaint.session.access_token;
		if (fpUserId && fpToken) {
			bootMinecraftCard(fpUserId, fpToken).catch(() => {});
		}
	}

	// Init with timeout — never hang forever
	try {
		await Promise.race([
			initSupa(),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error('Supabase init timed out')),
					INIT_TIMEOUT_MS,
				),
			),
		]);
	} catch {
		if (!painted) switchState('unauth');
		return;
	}

	const supa = getSupa();

	// Background sync: refresh profile + staff caches on auth events,
	// tab focus / visibility, and a 15-min fallback timer. Updates the
	// persistent atoms plus the BroadcastChannel bus so other tabs and
	// surfaces stay in sync without ever blocking the UI.
	installProfileSync({
		apiBase: window.location.origin,
		supabaseUrl: SUPABASE_URL,
		supabaseAnonKey: SUPABASE_ANON_KEY,
		subscribeAuth: (handler) =>
			supa.on('auth', (msg: unknown) => handler(msg as never)),
	});

	// Get current session
	const s = await supa.getSession().catch(() => null);
	const session = s?.session ?? null;

	// Handle current state — refresh whatever the fast paint already showed.
	await handleSession(session, 'init');

	// Listen for auth changes (sign-in / sign-out from other tabs or navbar)
	supa.on('auth', async (msg: any) => {
		const newSession = msg.session ?? null;
		await handleSession(newSession, 'auth-event');
	});
}
