// cross-domain.ts — Shared cookie utilities for cross-subdomain auth on *.kbve.com
//
// After OAuth success on any subdomain, call setSharedToken() to write
// a cookie readable by all *.kbve.com subdomains. On boot, call
// getSharedToken() to check if a session already exists from another subdomain.
//
// The cookie is a convenience bridge — IndexedDB remains the source of truth.
// If the cookie exists but the IDB session is missing, the token is imported
// into IDB so the droid workers can use it.

const COOKIE_NAME = 'kbve_auth_token';
const COOKIE_DOMAIN = '.kbve.com';
const COOKIE_MAX_AGE = 3600; // 1 hour — matches Supabase JWT default expiry

/**
 * Set a shared auth token cookie readable by all *.kbve.com subdomains.
 * Call after successful OAuth callback or session refresh.
 */
export function setSharedToken(accessToken: string): void {
	if (typeof document === 'undefined') return;

	const isLocalhost = window.location.hostname === 'localhost';
	const domain = isLocalhost ? '' : `; Domain=${COOKIE_DOMAIN}`;
	const secure = isLocalhost ? '' : '; Secure';

	document.cookie = [
		`${COOKIE_NAME}=${encodeURIComponent(accessToken)}`,
		`Path=/`,
		`Max-Age=${COOKIE_MAX_AGE}`,
		`SameSite=Lax`,
		secure,
		domain,
	]
		.filter(Boolean)
		.join('; ');
}

/**
 * Read the shared auth token from the cookie.
 * Returns null if not set or expired.
 */
export function getSharedToken(): string | null {
	if (typeof document === 'undefined') return null;

	const match = document.cookie
		.split('; ')
		.find((c) => c.startsWith(`${COOKIE_NAME}=`));

	if (!match) return null;

	const value = decodeURIComponent(match.split('=')[1]);
	return value || null;
}

/**
 * Clear the shared auth token cookie (call on logout).
 */
export function clearSharedToken(): void {
	if (typeof document === 'undefined') return;

	const isLocalhost = window.location.hostname === 'localhost';
	const domain = isLocalhost ? '' : `; Domain=${COOKIE_DOMAIN}`;

	document.cookie = [`${COOKIE_NAME}=`, `Path=/`, `Max-Age=0`, domain]
		.filter(Boolean)
		.join('; ');
}
