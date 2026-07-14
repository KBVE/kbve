import { getNetConfig } from './net-config';

/**
 * Session display name for the ARPG. A light, client-side name (NOT the
 * canonical Supabase profile.username): a signed-in player's kbve_username takes
 * priority; otherwise we use whatever they typed in the pre-game prompt, saved
 * to localStorage so it sticks between sessions. Used for the nameplate and sent
 * over the wire as the display name.
 */

const STORAGE_KEY = 'arpg:displayName';
const MAX_LEN = 18;

/** Trim + clamp a raw name to something safe to render/send. */
export function sanitizeName(raw: string): string {
	return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);
}

/** The Supabase username from the active session JWT, if signed in. */
export function sessionUsername(): string {
	const name = getNetConfig()?.username?.trim();
	return name && name.length > 0 ? name : '';
}

/** The locally-saved display name, if the player set one. */
export function savedName(): string {
	try {
		return sanitizeName(localStorage.getItem(STORAGE_KEY) ?? '');
	} catch {
		return '';
	}
}

export function saveName(name: string): void {
	try {
		localStorage.setItem(STORAGE_KEY, sanitizeName(name));
	} catch {
		/* localStorage unavailable (private mode / SSR) — name stays in-memory */
	}
}

/**
 * Resolve the name to play under: a signed-in username wins, else the saved
 * name. Empty means the player hasn't chosen one yet -> show the prompt.
 */
export function resolvePlayerName(): string {
	return sessionUsername() || savedName();
}

/** True when a signed-in username exists — the prompt can be skipped. */
export function hasSessionName(): boolean {
	return sessionUsername().length > 0;
}
