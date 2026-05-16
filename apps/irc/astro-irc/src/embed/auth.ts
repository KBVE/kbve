import { $avatarUrl } from './state';

// Cross-domain shared-token cookie reader.
// Mirrors @kbve/astro's getSharedToken so the embed bundle can read the
// same cookie set by chat.kbve.com / kbve.com after auth, without pulling
// the full @kbve/astro barrel (which drags in React/DroidProvider).
const SHARED_TOKEN_COOKIE = 'kbve_session';

function readSharedTokenCookie(): string {
	if (typeof document === 'undefined') return '';
	const target = `${SHARED_TOKEN_COOKIE}=`;
	const parts = document.cookie.split(';');
	for (const part of parts) {
		const trimmed = part.trim();
		if (trimmed.startsWith(target)) {
			return decodeURIComponent(trimmed.slice(target.length));
		}
	}
	return '';
}

function decodeJwtAvatar(token: string): string | null {
	const parts = token.split('.');
	if (parts.length < 2) return null;
	try {
		const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
		const padLen = padded.length + ((4 - (padded.length % 4)) % 4);
		const payload = JSON.parse(atob(padded.padEnd(padLen, '=')));
		return (
			payload?.kbve_avatar ||
			payload?.user_metadata?.avatar_url ||
			payload?.user_metadata?.picture ||
			null
		);
	} catch {
		return null;
	}
}

/**
 * Resolve the JWT to use for WS auth. Resolution order:
 *   1. Explicit `opts.token` passed by the host page (takes priority)
 *   2. Shared cookie on *.kbve.com origins (`kbve_session`)
 *   3. Empty string → embed runs in anonymous read-only mode
 */
export function resolveToken(explicit?: string): string {
	if (explicit && explicit.length > 0) {
		hydrateAvatarFromToken(explicit);
		return explicit;
	}
	const cookie = readSharedTokenCookie();
	if (cookie) hydrateAvatarFromToken(cookie);
	return cookie;
}

function hydrateAvatarFromToken(token: string): void {
	const avatar = decodeJwtAvatar(token);
	if (avatar) $avatarUrl.set(avatar);
}
