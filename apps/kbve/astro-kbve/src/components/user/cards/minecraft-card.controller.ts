/**
 * minecraft-card.controller.ts — populates MinecraftProfileCard slots.
 *
 * Single fetch against the existing `mc` edge function (`auth.status`).
 * No polling on the profile page — the link UI on /mc/ owns that. Cache
 * mirrors the profile-controller pattern: per-user, 5-min TTL.
 */

import {
	getLinkStatus,
	type LinkStatus,
} from '@/components/mc/mc-auth/mcAuthService';

const CACHE_KEY = 'cache:profile:mc';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CRAFATAR = 'https://crafatar.com/avatars';

interface CachedMc {
	user_id: string;
	cached_at: number;
	link: LinkStatus | null;
}

function dashUuid(uuid: string): string {
	if (uuid.length !== 32) return uuid;
	return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
}

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

function setBadge(state: 'linked' | 'pending' | 'unlinked' | 'unknown') {
	const badge = el('profile-mc-status-badge');
	if (!badge) return;
	badge.classList.remove(
		'profile-mc-badge--linked',
		'profile-mc-badge--pending',
		'profile-mc-badge--unlinked',
		'profile-mc-badge--unknown',
	);
	badge.classList.add(`profile-mc-badge--${state}`);
	badge.textContent = {
		linked: 'Linked',
		pending: 'Pending',
		unlinked: 'Not linked',
		unknown: '…',
	}[state];
}

function switchCardState(active: 'loading' | 'linked' | 'unlinked') {
	const map = {
		loading: 'profile-mc-state-loading',
		linked: 'profile-mc-state-linked',
		unlinked: 'profile-mc-state-unlinked',
	};
	for (const [key, id] of Object.entries(map)) {
		if (key === active) show(id);
		else hide(id);
	}
}

function getCached(userId: string): LinkStatus | null | undefined {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return undefined;
		const cached: CachedMc = JSON.parse(raw);
		if (cached.user_id !== userId) return undefined;
		if (Date.now() - cached.cached_at > CACHE_TTL_MS) return undefined;
		return cached.link;
	} catch {
		return undefined;
	}
}

function setCached(userId: string, link: LinkStatus | null) {
	try {
		localStorage.setItem(
			CACHE_KEY,
			JSON.stringify({ user_id: userId, cached_at: Date.now(), link }),
		);
	} catch {
		/* best effort */
	}
}

export function clearMinecraftCardCache() {
	try {
		localStorage.removeItem(CACHE_KEY);
	} catch {
		/* best effort */
	}
}

function populateLinked(link: LinkStatus) {
	const dashed = dashUuid(link.mc_uuid);

	const avatar = el('profile-mc-avatar') as HTMLImageElement | null;
	if (avatar) {
		avatar.src = `${CRAFATAR}/${dashed}?size=128&overlay=true`;
		avatar.alt = `Minecraft head for ${link.mc_uuid}`;
	}

	const username = el('profile-mc-username');
	if (username) {
		// Username isn't stored server-side — show mc_uuid as identity until
		// we add a username column. Keeps the card useful without a backfill.
		username.textContent = 'Linked Minecraft player';
	}

	const uuid = el('profile-mc-uuid');
	if (uuid) uuid.textContent = dashed;

	const since = el('profile-mc-linked-since');
	if (since && link.created_at) {
		try {
			const d = new Date(link.created_at);
			since.textContent = `Linked ${d.toLocaleDateString()}`;
		} catch {
			since.textContent = '';
		}
	}

	const publicLink = el('profile-mc-public-link') as HTMLAnchorElement | null;
	if (publicLink) {
		publicLink.href = `/mc/players/`;
		publicLink.hidden = false;
	}
}

function applyLink(link: LinkStatus | null) {
	if (link && link.is_verified) {
		populateLinked(link);
		setBadge('linked');
		switchCardState('linked');
		return;
	}
	if (link && link.is_pending) {
		setBadge('pending');
		switchCardState('unlinked');
		return;
	}
	setBadge('unlinked');
	switchCardState('unlinked');
}

/** Boot the MC card for a signed-in user. Idempotent. */
export async function bootMinecraftCard(userId: string, accessToken: string) {
	const card = el('profile-mc-card');
	if (!card) return;

	switchCardState('loading');

	// Cache-first for instant paint.
	const cached = getCached(userId);
	if (cached !== undefined) {
		applyLink(cached);
	}

	try {
		const link = await getLinkStatus(accessToken);
		setCached(userId, link);
		applyLink(link);
	} catch {
		// Degrade gracefully — show unlinked state if we have no cache.
		if (cached === undefined) {
			setBadge('unknown');
			switchCardState('unlinked');
		}
	}
}
