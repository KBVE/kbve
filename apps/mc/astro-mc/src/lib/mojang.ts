import {
	getCachedProfile,
	setCachedProfile,
	getCachedSkin,
	setCachedSkin,
} from './player-cache';

export interface MojangProfile {
	name: string;
	uuid: string;
	skinUrl: string | null;
}

const MOJANG_API = 'https://api.mojang.com/users/profiles/minecraft';
const MOJANG_SESSION =
	'https://sessionserver.mojang.com/session/minecraft/profile';

// Track whether direct Mojang API works (CORS).
// If it fails once, all subsequent requests go through our proxy.
let useFallbackProxy = false;

async function fetchJson(url: string): Promise<unknown> {
	const res = await fetch(url);
	if (!res.ok) return null;
	return res.json();
}

async function fetchUuid(
	username: string,
): Promise<{ id: string; name: string } | null> {
	if (!useFallbackProxy) {
		try {
			const data = (await fetchJson(
				`${MOJANG_API}/${encodeURIComponent(username)}`,
			)) as { id: string; name: string } | null;
			if (data?.id) return data;
		} catch {
			// CORS or network error — switch to proxy
			useFallbackProxy = true;
		}
	}

	// Fallback: proxy through our Axum server
	try {
		const data = (await fetchJson(
			`/api/mojang/profile/${encodeURIComponent(username)}`,
		)) as { id: string; name: string } | null;
		if (data?.id) return data;
	} catch {
		return null;
	}
	return null;
}

function insertHyphens(uuid: string): string {
	// Mojang returns UUIDs without hyphens: abcdef1234567890abcdef1234567890
	// Convert to: abcdef12-3456-7890-abcd-ef1234567890
	const u = uuid.replace(/-/g, '');
	return `${u.slice(0, 8)}-${u.slice(8, 12)}-${u.slice(12, 16)}-${u.slice(16, 20)}-${u.slice(20)}`;
}

async function fetchSkinUrl(uuid: string): Promise<string | null> {
	const dashlessUuid = uuid.replace(/-/g, '');
	let data: Record<string, unknown> | null = null;

	if (!useFallbackProxy) {
		try {
			data = (await fetchJson(
				`${MOJANG_SESSION}/${dashlessUuid}`,
			)) as Record<string, unknown> | null;
		} catch {
			useFallbackProxy = true;
		}
	}

	if (!data) {
		try {
			data = (await fetchJson(
				`/api/mojang/session/${dashlessUuid}`,
			)) as Record<string, unknown> | null;
		} catch {
			return null;
		}
	}

	if (!data) return null;

	// Parse the textures property
	const properties = data.properties as
		| Array<{ name: string; value: string }>
		| undefined;
	const texturesProp = properties?.find((p) => p.name === 'textures');
	if (!texturesProp) return null;

	try {
		const decoded = JSON.parse(atob(texturesProp.value));
		return decoded?.textures?.SKIN?.url ?? null;
	} catch {
		return null;
	}
}

export async function resolvePlayer(
	username: string,
): Promise<MojangProfile | null> {
	// Check IndexedDB cache first
	const cached = await getCachedProfile(username);
	if (cached) {
		return {
			name: cached.name,
			uuid: cached.uuid,
			skinUrl: cached.skinUrl,
		};
	}

	// Fetch UUID from Mojang
	const profile = await fetchUuid(username);
	if (!profile) return null;

	const uuid = insertHyphens(profile.id);

	// Fetch skin URL
	const skinUrl = await fetchSkinUrl(uuid);

	// Cache the result
	await setCachedProfile(username, uuid, skinUrl);

	return { name: profile.name, uuid, skinUrl };
}

function extractTextureHash(url: string): string | null {
	// https://textures.minecraft.net/texture/{hash}
	const match = url.match(/\/texture\/([0-9a-f]{60,64})$/i);
	return match ? match[1] : null;
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = () => resolve(null);
		reader.readAsDataURL(blob);
	});
}

export async function loadSkinDataUrl(
	uuid: string,
	skinUrl: string,
): Promise<string | null> {
	// Check IndexedDB cache first
	const cached = await getCachedSkin(uuid);
	if (cached) return cached;

	// Try proxy first (textures.minecraft.net blocks CORS)
	const hash = extractTextureHash(skinUrl);
	if (hash) {
		try {
			const res = await fetch(`/api/textures/${hash}`);
			if (res.ok) {
				const blob = await res.blob();
				const dataUrl = await blobToDataUrl(blob);
				if (dataUrl) {
					await setCachedSkin(uuid, dataUrl);
					return dataUrl;
				}
			}
		} catch {
			// proxy unavailable, try direct below
		}
	}

	// Fallback: try direct fetch (works if CORS is allowed)
	try {
		const res = await fetch(skinUrl);
		if (!res.ok) return null;

		const blob = await res.blob();
		const dataUrl = await blobToDataUrl(blob);
		if (dataUrl) {
			await setCachedSkin(uuid, dataUrl);
		}
		return dataUrl;
	} catch {
		return null;
	}
}
