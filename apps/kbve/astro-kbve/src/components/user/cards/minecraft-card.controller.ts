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
const HEAD_CACHE_KEY = 'cache:profile:mc-head';
const CACHE_TTL_MS = 5 * 60 * 1000;
const HEAD_CACHE_TTL_MS = 60 * 60 * 1000;
const HEAD_SIZE = 128;

interface CachedMc {
	user_id: string;
	cached_at: number;
	link: LinkStatus | null;
}

interface CachedHead {
	uuid: string;
	cached_at: number;
	data_url: string;
}

function dashUuid(uuid: string): string {
	if (uuid.length !== 32) return uuid;
	return `${uuid.slice(0, 8)}-${uuid.slice(8, 12)}-${uuid.slice(12, 16)}-${uuid.slice(16, 20)}-${uuid.slice(20)}`;
}

function getCachedHead(uuid: string): string | null {
	try {
		const raw = localStorage.getItem(HEAD_CACHE_KEY);
		if (!raw) return null;
		const cached: CachedHead = JSON.parse(raw);
		if (cached.uuid !== uuid) return null;
		if (Date.now() - cached.cached_at > HEAD_CACHE_TTL_MS) return null;
		return cached.data_url;
	} catch {
		return null;
	}
}

function setCachedHead(uuid: string, data_url: string) {
	try {
		localStorage.setItem(
			HEAD_CACHE_KEY,
			JSON.stringify({ uuid, cached_at: Date.now(), data_url }),
		);
	} catch {
		/* best effort */
	}
}

async function fetchHeadFromKbve(uuid: string): Promise<string | null> {
	const clean = uuid.replace(/-/g, '').toLowerCase();
	if (clean.length !== 32) return null;

	const cached = getCachedHead(clean);
	if (cached) return cached;

	const lookup = await fetch(`/api/v1/mc/players/by-uuid/${clean}`).catch(
		() => null,
	);
	if (!lookup || !lookup.ok) return null;
	const body = (await lookup.json().catch(() => null)) as {
		hash?: string;
	} | null;
	const hash = body?.hash;
	if (!hash) return null;

	const tex = await fetch(`/api/v1/mc/textures/${hash}`).catch(() => null);
	if (!tex || !tex.ok) return null;
	const blob = await tex.blob().catch(() => null);
	if (!blob) return null;

	const img = await new Promise<HTMLImageElement | null>((resolve) => {
		const url = URL.createObjectURL(blob);
		const i = new Image();
		i.onload = () => {
			URL.revokeObjectURL(url);
			resolve(i);
		};
		i.onerror = () => {
			URL.revokeObjectURL(url);
			resolve(null);
		};
		i.src = url;
	});
	if (!img) return null;

	const canvas = document.createElement('canvas');
	canvas.width = HEAD_SIZE;
	canvas.height = HEAD_SIZE;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	ctx.imageSmoothingEnabled = false;

	ctx.drawImage(img, 8, 8, 8, 8, 0, 0, HEAD_SIZE, HEAD_SIZE);
	ctx.drawImage(img, 40, 8, 8, 8, 0, 0, HEAD_SIZE, HEAD_SIZE);

	const data_url = canvas.toDataURL('image/png');
	setCachedHead(clean, data_url);
	return data_url;
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
		localStorage.removeItem(HEAD_CACHE_KEY);
	} catch {
		/* best effort */
	}
}

function populateLinked(link: LinkStatus) {
	const dashed = dashUuid(link.mc_uuid);

	const avatar = el('profile-mc-avatar') as HTMLImageElement | null;
	if (avatar) {
		avatar.removeAttribute('src');
		avatar.alt = `Minecraft head for ${link.mc_uuid}`;
		fetchHeadFromKbve(link.mc_uuid)
			.then((dataUrl) => {
				if (dataUrl) avatar.src = dataUrl;
			})
			.catch(() => {
				/* best effort — keep skeleton background */
			});
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
