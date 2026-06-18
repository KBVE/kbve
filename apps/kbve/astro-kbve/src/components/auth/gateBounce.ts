const GATE_REDIRECT_PARAM = 'redirect_to';

function isTrustedGateHost(host: string): boolean {
	return host === 'kbve.com' || host.endsWith('.kbve.com');
}

/**
 * Read a validated `redirect_to` from a URL query. Only https targets on
 * `*.kbve.com` are accepted — the value receives an access token, so an
 * unrestricted target would be an open-redirect token-exfiltration hole.
 */
export function readGateRedirect(
	search: string = typeof window !== 'undefined'
		? window.location.search
		: '',
): string | null {
	try {
		const raw = new URLSearchParams(search).get(GATE_REDIRECT_PARAM);
		if (!raw) return null;
		const url = new URL(raw);
		if (url.protocol !== 'https:') return null;
		if (!isTrustedGateHost(url.hostname)) return null;
		return url.toString();
	} catch {
		return null;
	}
}

/**
 * Hand the access token off to the gate by appending it to the target URL and
 * navigating. The gate mints a `kbve_gate` cookie from it and immediately
 * redirects to a clean URL, so the token never persists in history. Returns
 * true when it navigated.
 */
export function bounceToGate(redirectTo: string, accessToken: string): boolean {
	if (typeof window === 'undefined' || !redirectTo || !accessToken)
		return false;
	try {
		const url = new URL(redirectTo);
		if (!isTrustedGateHost(url.hostname)) return false;
		url.searchParams.set('access_token', accessToken);
		window.location.replace(url.toString());
		return true;
	} catch {
		return false;
	}
}
