import { $avatarUrl } from './state';

const SHARED_TOKEN_COOKIE = 'kbve_auth_token';

export function readSharedTokenCookie(): string {
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
