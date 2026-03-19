/**
 * profile-controller.ts — vanilla TS controller for the profile shell.
 *
 * All HTML states are pre-rendered in AstroProfileShell.astro with `hidden`.
 * This controller swaps visibility via element IDs — O(1) DOM operations,
 * no React rendering for layout-level state changes.
 *
 * States: loading → unauthenticated | username-setup | profile
 */

import { setAuth } from '@kbve/droid';
import { initSupa, getSupa } from '@/lib/supa';

// ── Element IDs (must match AstroProfileShell.astro) ─────────────────────────

const IDs = {
	shell: 'profile-shell',
	loading: 'profile-state-loading',
	unauth: 'profile-state-unauth',
	usernameSetup: 'profile-state-username',
	profile: 'profile-state-profile',
	// Slots for dynamic content within the static profile card
	profileName: 'profile-slot-name',
	profileEmail: 'profile-slot-email',
	profileAvatar: 'profile-slot-avatar',
	profileAvatarLetter: 'profile-slot-avatar-letter',
	profileAvatarImg: 'profile-slot-avatar-img',
	profileUsername: 'profile-slot-username',
	profilePublicLink: 'profile-slot-public-link',
	profileBadges: 'profile-slot-badges',
	profileProviders: 'profile-slot-providers',
	// Username form elements
	usernameInput: 'profile-username-input',
	usernameHint: 'profile-username-hint',
	usernameError: 'profile-username-error',
	usernameSubmit: 'profile-username-submit',
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Profile API ──────────────────────────────────────────────────────────────

const PROFILE_CACHE_KEY = 'cache:profile:me';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface ApiProfile {
	username: string;
	user_id: string;
	email?: string;
	profile_exists: boolean;
	discord?: {
		username?: string;
		avatar_url?: string;
		is_guild_member?: boolean;
	};
	github?: { username?: string; avatar_url?: string };
	twitch?: { username?: string; avatar_url?: string; is_live?: boolean };
	connected_providers?: string[];
}

function getCachedProfile(userId: string): ApiProfile | null {
	try {
		const raw = localStorage.getItem(PROFILE_CACHE_KEY);
		if (!raw) return null;
		const cached = JSON.parse(raw);
		if (cached.user_id !== userId) return null;
		if (Date.now() - cached.cached_at > CACHE_TTL_MS) return null;
		return cached.profile;
	} catch {
		return null;
	}
}

function setCachedProfile(profile: ApiProfile) {
	try {
		localStorage.setItem(
			PROFILE_CACHE_KEY,
			JSON.stringify({
				profile,
				cached_at: Date.now(),
				user_id: profile.user_id,
			}),
		);
	} catch {
		/* best effort */
	}
}

async function fetchProfile(token: string): Promise<ApiProfile | null> {
	try {
		const res = await fetch('/api/v1/profile/me', {
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
			},
		});
		if (!res.ok) return null;
		const data: ApiProfile = await res.json();
		setCachedProfile(data);
		return data;
	} catch {
		return null;
	}
}

// ── Populate profile card slots ──────────────────────────────────────────────

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

// ── Username form handling ───────────────────────────────────────────────────

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,23}$/;

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

function setupUsernameForm(
	token: string,
	onSuccess: (username: string) => void,
) {
	const input = el(IDs.usernameInput) as HTMLInputElement | null;
	const hint = el(IDs.usernameHint);
	const errorEl = el(IDs.usernameError);
	const submit = el(IDs.usernameSubmit) as HTMLButtonElement | null;
	if (!input || !submit) return;

	// Real-time validation
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

	// Submit
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

// ── Main boot ────────────────────────────────────────────────────────────────

export async function bootProfile() {
	switchState('loading');

	try {
		await initSupa();
	} catch {
		// Auth failed — show guest state
		switchState('unauth');
		return;
	}

	const supa = getSupa();
	const s = await supa.getSession().catch(() => null);
	const session = s?.session ?? null;

	if (!session?.user) {
		switchState('unauth');
		return;
	}

	const token = session.access_token;
	const userId = session.user.id;

	// Try cache first for instant display
	const cached = getCachedProfile(userId);
	let profile = cached;

	if (cached) {
		if (cached.username) {
			populateProfile(cached, session);
			switchState('profile');
		} else {
			switchState('usernameSetup');
		}
	}

	// Fetch fresh from API
	const fresh = await fetchProfile(token);
	if (fresh) {
		profile = fresh;
		if (fresh.username) {
			populateProfile(fresh, session);
			switchState('profile');
		} else if (!cached?.username) {
			// Still no username — show setup form
			switchState('usernameSetup');
			setupUsernameForm(token, (newUsername) => {
				// Username claimed — update and switch to profile view
				const updated = {
					...fresh,
					username: newUsername,
					profile_exists: true,
				};
				setCachedProfile(updated);
				populateProfile(updated, session);
				setAuth({ username: newUsername });
				switchState('profile');
			});
		}
	} else if (!cached) {
		// No cache, no API — show profile with session data only
		populateProfile(
			{ username: '', user_id: userId, profile_exists: false },
			session,
		);
		switchState('profile');
	}

	// Also set up the form if we showed it from cache
	if (profile && !profile.username) {
		setupUsernameForm(token, (newUsername) => {
			const updated = {
				...(profile as ApiProfile),
				username: newUsername,
				profile_exists: true,
			};
			setCachedProfile(updated);
			populateProfile(updated, session);
			setAuth({ username: newUsername });
			switchState('profile');
		});
	}
}
