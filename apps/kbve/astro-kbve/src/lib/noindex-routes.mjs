export const NOINDEX_PREFIXES = [
	'/dashboard/',
	'/auth/',
];

export const NOINDEX_EXACT = [
	'/404/',
	'/500/',
	'/502/',
	'/503/',
	'/login/',
	'/logout/',
	'/register/',
];

export function isNoindexPath(pathname) {
	if (!pathname) return false;
	const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
	if (NOINDEX_EXACT.includes(path)) return true;
	return NOINDEX_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function isIndexableUrl(url) {
	try {
		return !isNoindexPath(new URL(url).pathname);
	} catch {
		return true;
	}
}
